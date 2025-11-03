const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PUBLIC = path.join(__dirname, 'public');

app.use(express.static(PUBLIC));

let wordsData = {};
try {
  const raw = fs.readFileSync(path.join(PUBLIC, 'words.json'), 'utf8');
  wordsData = JSON.parse(raw);
} catch (e) {
  wordsData = {};
}

let players = {};
let scores = { equipe1: 0, equipe2: 0 };
let usedWords = new Set();
let selectedCategory = null;
let selectedPlayerId = null;
let currentRound = null;
let lastActivity = Date.now();

function pickWord(category) {
  const list = wordsData[category] || [];
  const available = list.filter(w => !usedWords.has(category + '::' + w));
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  const w = available[idx];
  usedWords.add(category + '::' + w);
  return w;
}

function broadcastState() {
  io.emit('state', {
    players: Object.values(players).map(p => ({ id: p.id, name: p.name, role: p.role })),
    scores,
    categories: Object.keys(wordsData),
    selectedCategory,
    selectedPlayerId,
    currentRoundActive: !!currentRound
  });
}

function resetGame() {
  players = {};
  scores = { equipe1: 0, equipe2: 0 };
  usedWords = new Set();
  selectedCategory = null;
  selectedPlayerId = null;
  if (currentRound && currentRound.timeout) {
    clearTimeout(currentRound.timeout);
  }
  currentRound = null;
  io.emit('resetAll');
  broadcastState();
}

setInterval(()=> {
  if (Date.now() - lastActivity > 2 * 60 * 60 * 1000) {
    resetGame();
  }
}, 60000);

io.on('connection', socket => {
  lastActivity = Date.now();
  socket.onAny(()=> lastActivity = Date.now());

  socket.emit('init', { categories: Object.keys(wordsData), scores, players: Object.values(players).map(p=>({id:p.id,name:p.name,role:p.role})) });

  socket.on('join', ({name})=>{
    players[socket.id] = { id: socket.id, name: name || 'Visitante', role: 'visitor' };
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,role:p.role})));
    broadcastState();
  });

  socket.on('becomeVisitor', ()=>{
    if (!players[socket.id]) return;
    players[socket.id].role = 'visitor';
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,role:p.role})));
    broadcastState();
  });

  socket.on('becomeAdmin', ({password})=>{
    if (!players[socket.id]) return;
    if (String(password) === '12345678') {
      players[socket.id].role = 'admin';
      io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,role:p.role})));
      broadcastState();
      socket.emit('adminAccepted');
    } else {
      socket.emit('adminDenied');
    }
  });

  socket.on('selectCategory', (cat)=>{
    if (!players[socket.id]) return;
    selectedCategory = cat;
    broadcastState();
  });

  socket.on('selectPlayer', (playerId)=>{
    if (!players[socket.id]) return;
    selectedPlayerId = playerId;
    broadcastState();
  });

  socket.on('startRound', ()=>{
    const initiator = players[socket.id];
    if (!initiator || initiator.role !== 'admin') return;
    if (!selectedCategory || !selectedPlayerId) return;
    if (!players[selectedPlayerId]) return;
    if (currentRound) return;
    currentRound = {
      category: selectedCategory,
      playerId: selectedPlayerId,
      words: [],
      startedAt: Date.now(),
      duration: 75,
      timeout: null
    };
    function nextWordImmediate() {
      const w = pickWord(currentRound.category);
      const word = w || '---';
      currentRound.words.push({ word, status: 'pending' });
      io.to(currentRound.playerId).emit('roundWord', { word, remaining: Math.max(0, Math.ceil((currentRound.startedAt + currentRound.duration*1000 - Date.now())/1000)) });
    }
    nextWordImmediate();
    io.to(currentRound.playerId).emit('roundStart', { duration: currentRound.duration });
    io.emit('roundHiddenForAll', { except: currentRound.playerId });
    currentRound.timeout = setTimeout(()=>{
      endRound();
    }, currentRound.duration * 1000);
    broadcastState();
  });

  socket.on('roundCorrect', ()=>{
    if (!currentRound) return;
    if (socket.id !== currentRound.playerId) return;
    for (let i = currentRound.words.length-1; i>=0; i--) {
      if (currentRound.words[i].status === 'pending') {
        currentRound.words[i].status = 'correct';
        break;
      }
    }
    const w = pickWord(currentRound.category);
    const word = w || '---';
    currentRound.words.push({ word, status: 'pending' });
    io.to(currentRound.playerId).emit('roundWord', { word, remaining: Math.max(0, Math.ceil((currentRound.startedAt + currentRound.duration*1000 - Date.now())/1000)) });
  });

  socket.on('roundSkip', ()=>{
    if (!currentRound) return;
    if (socket.id !== currentRound.playerId) return;
    for (let i = currentRound.words.length-1; i>=0; i--) {
      if (currentRound.words[i].status === 'pending') {
        currentRound.words[i].status = 'skipped';
        break;
      }
    }
    setTimeout(()=>{
      if (!currentRound) return;
      const w = pickWord(currentRound.category);
      const word = w || '---';
      currentRound.words.push({ word, status: 'pending' });
      io.to(currentRound.playerId).emit('roundWord', { word, remaining: Math.max(0, Math.ceil((currentRound.startedAt + currentRound.duration*1000 - Date.now())/1000)) });
    }, 3000);
  });

  function endRound() {
    if (!currentRound) return;
    clearTimeout(currentRound.timeout);
    const report = currentRound.words.map(w => ({ word: w.word, status: w.status === 'pending' ? 'skipped' : w.status }));
    io.emit('roundEnded', { report });
    currentRound = null;
    selectedCategory = null;
    selectedPlayerId = null;
    broadcastState();
  }

  socket.on('endRoundNow', ()=>{
    const initiator = players[socket.id];
    if (!initiator || initiator.role !== 'admin') return;
    endRound();
  });

  socket.on('changeScore', ({team, delta})=>{
    const initiator = players[socket.id];
    if (!initiator || initiator.role !== 'admin') return;
    if (team === 1) scores.equipe1 += delta;
    if (team === 2) scores.equipe2 += delta;
    io.emit('scores', scores);
  });

  socket.on('continueAfterVerification', ()=>{
    const initiator = players[socket.id];
    if (!initiator || initiator.role !== 'admin') return;
    io.emit('verificationContinue');
    broadcastState();
  });

  socket.on('reset', ()=>{
    const initiator = players[socket.id];
    if (!initiator || initiator.role !== 'admin') return;
    resetGame();
  });

  socket.on('requestNextWord', ()=>{
    if (!currentRound) return;
    if (socket.id !== currentRound.playerId) return;
    const w = pickWord(currentRound.category);
    const word = w || '---';
    currentRound.words.push({ word, status: 'pending' });
    io.to(currentRound.playerId).emit('roundWord', { word, remaining: Math.max(0, Math.ceil((currentRound.startedAt + currentRound.duration*1000 - Date.now())/1000)) });
  });

  socket.on('disconnect', ()=>{
    delete players[socket.id];
    if (currentRound && currentRound.playerId === socket.id) {
      endRound();
    }
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,role:p.role})));
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>{});
