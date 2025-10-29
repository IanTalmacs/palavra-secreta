// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static
app.use(express.static(path.join(__dirname, 'public')));

// Load words.json (categories => arrays)
const WORDS_PATH = path.join(__dirname, 'public', 'words.json');
let WORDS = {};
try {
  WORDS = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
} catch (e) {
  console.error('Não foi possível ler words.json', e);
  WORDS = {};
}

// --- Game state (ephemeral: reset if admin disconnects / refresh) ---
let state = createInitialState();
let timerInterval = null;

function createInitialState(){
  return {
    screen: 1, // 1..6
    players: {}, // socketId -> {id, nameRaw, name, team: 'lobby'|'team1'|'team2', isAdmin:false}
    adminIds: [], // sockets considered admin (nameRaw contains 999)
    chosenCategory: null,
    selectedPlayerId: null, // socket id chosen to play
    round: {
      active: false,
      duration: 75,
      timeLeft: 0,
      currentWord: null,
      skipping: false,
      usedWords: [], // words already drawn this session
      guessed: [], // {word, byTeam}
      skipped: [], // words
      teamScores: { team1: 0, team2: 0 }
    }
  };
}

function broadcastState(){
  // Prepare sanitized state for clients
  const playersList = Object.values(state.players).map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    isAdmin: p.isAdmin
  }));
  io.emit('state', {
    screen: state.screen,
    players: playersList,
    adminCount: state.adminIds.length,
    chosenCategory: state.chosenCategory,
    selectedPlayerId: state.selectedPlayerId,
    round: {
      active: state.round.active,
      duration: state.round.duration,
      timeLeft: state.round.timeLeft,
      currentWord: state.round.currentWord ? maskWord(state.round.currentWord) : null,
      skipping: state.round.skipping,
      usedCount: state.round.usedWords.length,
      guessed: state.round.guessed,
      skipped: state.round.skipped,
      teamScores: state.round.teamScores
    }
  });
}

function maskWord(w){ return w; } // we send actual words to clients in 5(a) for the active player, but we control that per-socket.

function getPlayerListByTeam(){
  const res = { lobby: [], team1: [], team2: [] };
  Object.values(state.players).forEach(p=>{
    res[p.team || 'lobby'].push({ id: p.id, name: p.name, isAdmin: p.isAdmin });
  });
  return res;
}

function hasExactlyOneAdmin(){ return state.adminIds.length === 1; }

function resetEverythingBecauseAdminLeft(){
  // Clear timer
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  state = createInitialState();
  io.emit('resetToScreen1');
  broadcastState();
}

// Utility: pick next unused word from chosenCategory or global if null
function pickNextWord(){
  const cat = state.chosenCategory;
  const pool = (cat && WORDS[cat]) ? WORDS[cat] : Object.values(WORDS).flat();
  const unused = pool.filter(w => !state.round.usedWords.includes(w));
  if (unused.length === 0) return null;
  const idx = Math.floor(Math.random() * unused.length);
  const w = unused[idx];
  state.round.usedWords.push(w);
  return w;
}

// Start round: create timer, pick first word, emit ticks
function startRound(){
  state.round.active = true;
  state.round.timeLeft = state.round.duration;
  state.round.currentWord = pickNextWord();
  state.round.skipping = false;
  // reset scores for this round only? The spec says "placar" above screen3 - assume persistent during round; we'll keep teamScores across that round only (already stored).
  // Start interval
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    state.round.timeLeft -= 1;
    if (state.round.timeLeft <= 0){
      clearInterval(timerInterval);
      timerInterval = null;
      state.round.active = false;
      // advance to screen 6
      state.screen = 6;
      io.emit('roundEnded', {
        guessed: state.round.guessed,
        skipped: state.round.skipped,
        teamScores: state.round.teamScores
      });
      broadcastState();
      return;
    }
    // emit tick
    io.emit('tick', { timeLeft: state.round.timeLeft });
    // If timeLeft becomes 5 => tell clients to hide 'pular'
    if (state.round.timeLeft === 5){
      io.emit('hideSkip');
    }
  }, 1000);
  // send initial data
  io.emit('roundStarted', {
    duration: state.round.duration,
    timeLeft: state.round.timeLeft,
    currentWord: state.round.currentWord,
    selectedPlayerId: state.selectedPlayerId
  });
  broadcastState();
}

// --- Socket handlers ---
io.on('connection', socket => {
  console.log('conn', socket.id);

  // send current state
  socket.emit('welcome', { socketId: socket.id });
  broadcastState();

  // join with name
  socket.on('joinWithName', (nameRaw) => {
    // store player
    const isAdmin = nameRaw.includes('999');
    const name = nameRaw.replace(/999/g, '').trim() || 'Player';
    state.players[socket.id] = {
      id: socket.id,
      nameRaw,
      name,
      team: 'lobby',
      isAdmin
    };
    if (isAdmin) {
      state.adminIds.push(socket.id);
    }
    // If multiple admins -> we keep them in adminIds but confirm button disabled until exactly one exists.
    // If admin count changed to 0 -> nothing; if admin disconnected handled in disconnect.
    broadcastState();
  });

  // Player clicks confirm (screen1). Allowed for everyone, but only works if exactly one admin present.
  socket.on('confirm', () => {
    if (state.screen !== 1) return;
    if (!hasExactlyOneAdmin()){
      socket.emit('msg', 'É necessário exatamente 1 admin conectado para confirmar.');
      return;
    }
    state.screen = 2;
    broadcastState();
  });

  // Admin moves player between teams via drag/drop
  socket.on('movePlayer', ({playerId, toTeam})=>{
    // only admin allowed to move
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (!state.players[playerId]) return;
    if (!['lobby','team1','team2'].includes(toTeam)) return;
    state.players[playerId].team = toTeam;
    broadcastState();
  });

  // Admin clicks categorias on screen2 -> advance to 3
  socket.on('openCategories', ()=>{
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (state.screen !== 2) return;
    state.screen = 3;
    broadcastState();
  });

  // Admin choose a category on screen3 -> set chosenCategory and go to screen4
  socket.on('chooseCategory', (cat)=>{
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (state.screen !== 3) return;
    if (!WORDS[cat]) return;
    state.chosenCategory = cat;
    state.screen = 4;
    broadcastState();
  });

  // Admin selects a player on screen4
  socket.on('selectPlayer', (playerId)=>{
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (state.screen !== 4) return;
    if (!state.players[playerId]) return;
    state.selectedPlayerId = playerId;
    broadcastState();
  });

  // The chosen player clicks 'iniciar' (start their round) -> start round on server
  socket.on('playerStartRound', ()=>{
    if (state.screen !== 4) return;
    if (socket.id !== state.selectedPlayerId) return; // only chosen player
    // move all to 5(a)/5(b) view: server will start round and emit events
    // set screen to 5 (we will let clients render 5a or 5b depending if they are selectedPlayer)
    state.screen = 5;
    // reset per-round trackers
    state.round.usedWords = [];
    state.round.guessed = [];
    state.round.skipped = [];
    state.round.teamScores = { team1: 0, team2: 0 };
    startRound();
  });

  // The chosen player guesses a word (acertou)
  socket.on('guess', ()=>{
    if (!state.round.active) return;
    if (socket.id !== state.selectedPlayerId) return;
    if (state.round.skipping) return; // disabled during skipping
    if (!state.round.currentWord) return;

    const w = state.round.currentWord;
    // award point to player's team
    const player = state.players[socket.id];
    const team = player && player.team ? player.team : 'team1';
    const teamKey = team === 'team1' ? 'team1' : 'team2';
    state.round.teamScores[teamKey] += 1;
    state.round.guessed.push({ word: w, byTeam: teamKey });

    // pick next word and immediately send to clients
    const next = pickNextWord();
    state.round.currentWord = next;
    io.emit('wordGuessed', {
      word: w,
      nextWord: next,
      teamScores: state.round.teamScores
    });
    broadcastState();
    // if no next word -> end round early
    if (!next){
      // end round immediately
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      state.round.active = false;
      state.screen = 6;
      io.emit('roundEnded', {
        guessed: state.round.guessed,
        skipped: state.round.skipped,
        teamScores: state.round.teamScores
      });
      broadcastState();
    }
  });

  // The chosen player skips a word
  socket.on('skip', ()=>{
    if (!state.round.active) return;
    if (socket.id !== state.selectedPlayerId) return;
    if (state.round.skipping) return;
    if (state.round.timeLeft <= 5) return; // skipping not allowed when <=5s
    if (!state.round.currentWord) return;

    const w = state.round.currentWord;
    state.round.skipped.push(w);

    // Start skipping period (3s) during which current word / buttons hidden for that player only by clients,
    // but server still counts time. We'll set skipping flag and after 3s pick next.
    state.round.skipping = true;
    io.emit('wordSkipped', { word: w }); // clients will hide UI accordingly
    setTimeout(()=>{
      const next = pickNextWord();
      state.round.currentWord = next;
      state.round.skipping = false;
      io.emit('skipEnded', { nextWord: next });
      broadcastState();
      // If no next word -> end
      if (!next){
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        state.round.active = false;
        state.screen = 6;
        io.emit('roundEnded', {
          guessed: state.round.guessed,
          skipped: state.round.skipped,
          teamScores: state.round.teamScores
        });
        broadcastState();
      }
    }, 3000);
    broadcastState();
  });

  // On screen6: admin clicks 'categorias' to go back to screen3 (and keep words reset for fresh round)
  socket.on('backToCategories', ()=>{
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    // reset round info but keep players
    state.chosenCategory = null;
    state.selectedPlayerId = null;
    state.round = {
      active: false,
      duration: 75,
      timeLeft: 0,
      currentWord: null,
      skipping: false,
      usedWords: [],
      guessed: [],
      skipped: [],
      teamScores: { team1: 0, team2: 0 }
    };
    state.screen = 3;
    broadcastState();
  });

  socket.on('disconnect', () => {
    console.log('disc', socket.id);
    const wasAdmin = state.players[socket.id] && state.players[socket.id].isAdmin;
    // remove player
    delete state.players[socket.id];
    // remove from adminIds if present
    state.adminIds = state.adminIds.filter(id => id !== socket.id);

    // If admin left -> reset everything to screen 1 per spec
    if (wasAdmin){
      resetEverythingBecauseAdminLeft();
      return;
    }

    // else broadcast updated state
    broadcastState();
  });

});
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('listening on', PORT));
