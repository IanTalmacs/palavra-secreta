const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Game state (in-memory, resets on server restart)
let players = {}; // socketId -> {name, role: 'visitor'|'admin', team: null|'lobby'|'team1'|'team2', deviceName}
let lobby = []; // socketIds in lobby order
let teams = { team1: [], team2: [] }; // arrays of socketIds
let teamNames = { team1: 'Equipe 1', team2: 'Equipe 2' };
let scores = { team1: 0, team2: 0 };
let availableCategories = ['animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissoes','alimentos','personagens','bíblico'];
let categoryWords = require('./public/words.json'); // map category->array
let usedWords = new Set();
let phase = 'join'; // join, lobby, categories, preparing, turn, review, end
let currentCategory = null;
let roundWords = []; // [{word, status:'correct'|'skipped'}]
let currentTurn = { team: null, playerSocket: null, roundEndAt: null, started: false };
let rotation = { team1: 0, team2: 0 };

function resetRoundData() {
  roundWords = [];
  currentTurn = { team: null, playerSocket: null, roundEndAt: null, started: false };
}

function resetAll() {
  players = {};
  lobby = [];
  teams = { team1: [], team2: [] };
  teamNames = { team1: 'Equipe 1', team2: 'Equipe 2' };
  scores = { team1: 0, team2: 0 };
  availableCategories = ['animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissoes','alimentos','personagens','bíblico'];
  usedWords = new Set();
  phase = 'join';
  currentCategory = null;
  resetRoundData();
  rotation = { team1: 0, team2: 0 };
}

// Utility: pick a random unused word from category
function pickWord(category) {
  const pool = categoryWords[category] || [];
  const candidates = pool.filter(w => !usedWords.has(w));
  if (candidates.length === 0) return null;
  const w = candidates[Math.floor(Math.random()*candidates.length)];
  usedWords.add(w);
  return w;
}

// Send full state to a socket
function emitState(to) {
  const state = {
    phase,
    players: Object.fromEntries(Object.entries(players).map(([id,p])=>[id,{name:p.name, role:p.role, team:p.team, deviceName:p.deviceName}])),
    lobby: lobby.map(id => ({id, name: players[id]?.name||'--'})),
    teams: {
      team1: teams.team1.map(id=>({id, name: players[id]?.name||'--'})),
      team2: teams.team2.map(id=>({id, name: players[id]?.name||'--'}))
    },
    teamNames,
    scores,
    availableCategories,
    currentCategory,
    roundWords,
    currentTurn
  };
  if (to) io.to(to).emit('state', state);
  else io.emit('state', state);
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  socket.on('join', ({deviceName}) => {
    // deviceName must be >=2 letters; validation client-side too
    players[socket.id] = { name: deviceName, deviceName, role: 'visitor', team: 'lobby' };
    lobby.push(socket.id);
    emitState();
  });

  socket.on('chooseRole', ({role, password}) => {
    const p = players[socket.id];
    if (!p) return;
    if (role === 'admin' && password === '12345678') {
      p.role = 'admin';
      // When admin becomes admin, reset non-permanent data per spec
      scores = { team1: 0, team2: 0 };
      usedWords = new Set();
      rotation = { team1: 0, team2: 0 };
      availableCategories = ['animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissoes','alimentos','personagens','bíblico'];
      phase = 'lobby';
    } else {
      p.role = 'visitor';
      phase = 'lobby';
    }
    emitState();
  });

  socket.on('renameTeam', ({team, name}) => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    if (team === 'team1' || team === 'team2') {
      teamNames[team] = name || teamNames[team];
      emitState();
    }
  });

  socket.on('moveToTeam', ({playerId, toTeam}) => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    // remove from lobby and other team
    lobby = lobby.filter(id=>id!==playerId);
    teams.team1 = teams.team1.filter(id=>id!==playerId);
    teams.team2 = teams.team2.filter(id=>id!==playerId);
    if (toTeam === 'lobby') lobby.push(playerId);
    else if (toTeam === 'team1') teams.team1.push(playerId);
    else if (toTeam === 'team2') teams.team2.push(playerId);

    if (players[playerId]) players[playerId].team = toTeam;
    emitState();
  });

  socket.on('startFromLobby', () => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    phase = 'categories';
    emitState();
  });

  socket.on('selectCategory', ({category}) => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    if (!availableCategories.includes(category)) return;
    currentCategory = category;
    phase = 'prepare';
    // pick first player from team1 (rotation)
    const team = 'team1';
    let idx = rotation.team1 % (teams.team1.length || 1);
    const playerSocket = teams.team1[idx] || null;
    currentTurn = { team, playerSocket, roundEndAt: null, started: false };
    emitState();
  });

  socket.on('startTurn', () => {
    const p = players[socket.id];
    if (!p) return;
    if (!currentTurn.playerSocket || socket.id !== currentTurn.playerSocket) return;
    // start 75s timer synchronized by sending end timestamp
    const now = Date.now();
    const duration = 75*1000;
    currentTurn.roundEndAt = now + duration;
    currentTurn.started = true;
    phase = 'turn';
    resetRoundData();
    io.emit('timerStarted', {endAt: currentTurn.roundEndAt});
    emitState();
  });

  socket.on('correct', () => {
    const p = players[socket.id];
    if (!p) return;
    if (socket.id !== currentTurn.playerSocket) return;
    // add point
    const t = currentTurn.team;
    if (!t) return;
    scores[t] = (scores[t]||0)+1;
    // pick new word
    const w = pickWord(currentCategory);
    if (!w) {
      // no more words: end early
      io.emit('noMoreWords');
    } else {
      roundWords.push({word:w, status:'correct'});
      io.emit('newWord', {word:w});
    }
    emitState();
  });

  socket.on('skip', async () => {
    const p = players[socket.id];
    if (!p) return;
    if (socket.id !== currentTurn.playerSocket) return;
    // mark skip, schedule 3s hiding
    roundWords.push({word:'pulando...', status:'skipped'});
    io.emit('skipping');
    // pick next word after 3s
    setTimeout(()=>{
      const w = pickWord(currentCategory);
      if (!w) io.emit('noMoreWords');
      else io.emit('newWord', {word:w});
      emitState();
    }, 3000);
    emitState();
  });

  socket.on('submitWordRequest', () => {
    // client asks server for first word when turn starts
    if (!currentTurn.started) return;
    if (!currentTurn.playerSocket) return;
    const w = pickWord(currentCategory);
    if (!w) io.to(currentTurn.playerSocket).emit('newWord', {word:null});
    else {
      roundWords.push({word:w, status:'waiting'});
      io.to(currentTurn.playerSocket).emit('newWord', {word:w});
      emitState();
    }
  });

  socket.on('endTurn', () => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    // conclude current turn manually: used when timer ran out
    phase = 'review';
    // convert 'waiting' entries to 'correct' or 'skipped' as appropriate
    // but we keep statuses
    emitState();
  });

  socket.on('finishReview', () => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    // After team1 finished, go to team2 prepare, or back to categories if both done
    if (currentTurn.team === 'team1') {
      // prepare team2
      const team = 'team2';
      let idx = rotation.team2 % (teams.team2.length || 1);
      const playerSocket = teams.team2[idx] || null;
      currentTurn = { team, playerSocket, roundEndAt: null, started: false };
      phase = 'prepare';
    } else if (currentTurn.team === 'team2') {
      // complete category round: remove category and advance rotations
      availableCategories = availableCategories.filter(c=>c!==currentCategory);
      // advance rotation pointers
      rotation.team1 = (rotation.team1 + 1) % Math.max(1, teams.team1.length);
      rotation.team2 = (rotation.team2 + 1) % Math.max(1, teams.team2.length);
      currentCategory = null;
      phase = 'categories';
    }
    emitState();
  });

  socket.on('finalizeGame', ({confirm}) => {
    const p = players[socket.id];
    if (!p || p.role !== 'admin') return;
    if (confirm) {
      phase = 'end';
      emitState();
    } else {
      phase = 'categories';
      emitState();
    }
  });

  socket.on('disconnect', () => {
    // remove player
    if (players[socket.id]) {
      // remove from lobby & teams
      lobby = lobby.filter(id=>id!==socket.id);
      teams.team1 = teams.team1.filter(id=>id!==socket.id);
      teams.team2 = teams.team2.filter(id=>id!==socket.id);
      delete players[socket.id];
    }
    emitState();
  });

  // send initial state to new connection
  emitState(socket.id);
});

server.listen(PORT, ()=>console.log('listening', PORT));