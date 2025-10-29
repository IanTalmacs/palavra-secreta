const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Load words from file
const WORDS_PATH = path.join(__dirname, 'public', 'words.json');
function loadWords() {
  const raw = fs.readFileSync(WORDS_PATH, 'utf8');
  return JSON.parse(raw);
}

// game state (in-memory, reset when admin (re)joins or server restarts)
let state = createNewState();
let adminSocketId = null;

function createNewState() {
  const words = loadWords();
  return {
    players: {}, // socketId -> {name, displayName, team: 'lobby'|'team1'|'team2'}
    lobbyOrder: [],
    teams: { team1: [], team2: [] },
    categories: [
      { key: 'animais', label: 'animais' },
      { key: 'tv_cinema', label: 'tv e cinema' },
      { key: 'objetos', label: 'objetos' },
      { key: 'lugares', label: 'lugares' },
      { key: 'pessoas', label: 'pessoas' },
      { key: 'esportes_e_jogos', label: 'esportes e jogos' },
      { key: 'profissoes', label: 'profissões' },
      { key: 'alimentos', label: 'alimentos' },
      { key: 'personagens', label: 'personagens' },
      { key: 'biblico', label: 'bíblico' }
    ],
    availableWords: loadWords(), // copy
    usedWords: {}, // categoryKey -> Set
    scores: { team1: 0, team2: 0 },
    round: {
      currentCategory: null,
      phase: 'lobby', // lobby, category, picking, playing, review
      turnTeam: null, // 'team1'|'team2'
      activePlayerSocket: null,
      rotationIndex: { team1: 0, team2: 0 }
    }
  };
}

function resetGameFromAdminJoin(adminSocket) {
  state = createNewState();
  adminSocketId = adminSocket.id;
  io.emit('reset');
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const isAdmin = name.includes('9999');
    const displayName = name.replace(/9999/g, '').trim() || 'Player';
    state.players[socket.id] = { name, displayName, team: 'lobby', socketId: socket.id };
    state.lobbyOrder.push(socket.id);

    if (isAdmin) {
      // admin (re)joined -> reset everything
      resetGameFromAdminJoin(socket);
    }

    // send full state to the new client
    io.emit('state', publicState());
  });

  socket.on('requestState', () => {
    socket.emit('state', publicState());
  });

  socket.on('updateTeams', (teams) => {
    if (socket.id !== adminSocketId) return;
    // teams: { team1: [socketId], team2: [socketId], lobby: [socketId] }
    // apply teams
    for (const sid in state.players) {
      state.players[sid].team = 'lobby';
    }
    state.teams.team1 = teams.team1.slice();
    state.teams.team2 = teams.team2.slice();
    state.lobbyOrder = teams.lobby.slice();

    for (const sid of state.teams.team1) if (state.players[sid]) state.players[sid].team = 'team1';
    for (const sid of state.teams.team2) if (state.players[sid]) state.players[sid].team = 'team2';
    for (const sid of state.lobbyOrder) if (state.players[sid]) state.players[sid].team = 'lobby';

    io.emit('state', publicState());
  });

  socket.on('startCategoryPhase', (categoryKey) => {
    if (socket.id !== adminSocketId) return;
    if (!state.categories.find(c => c.key === categoryKey)) return;
    state.round.currentCategory = categoryKey;
    state.round.phase = 'category';
    // initialize usedWords set for this category
    state.usedWords[categoryKey] = new Set();
    // set turnTeam to team1 first
    state.round.turnTeam = 'team1';
    io.emit('state', publicState());
  });

  socket.on('adminAdvanceFromCategories', () => {
    if (socket.id !== adminSocketId) return;
    if (!state.round.currentCategory) return;
    // choose first player from turnTeam according to rotation index
    startNextTurn();
  });

  socket.on('startTurn', () => {
    // only active player can start
    if (socket.id !== state.round.activePlayerSocket) return;
    startTimerForActivePlayer();
  });

  socket.on('correct', () => {
    // only active player can send correct
    if (socket.id !== state.round.activePlayerSocket) return;
    const category = state.round.currentCategory;
    const word = pickWord(category);
    if (!word) return;
    state.round.lastRound = state.round.lastRound || { correct: [], skipped: [] };
    state.round.lastRound.correct.push(word);
    // add score to active team
    if (state.round.turnTeam === 'team1') state.scores.team1 += 1;
    else state.scores.team2 += 1;
    io.emit('wordCorrect', { word, scores: state.scores });
  });

  socket.on('skip', () => {
    if (socket.id !== state.round.activePlayerSocket) return;
    const category = state.round.currentCategory;
    const word = pickWord(category);
    if (!word) return;
    state.round.lastRound = state.round.lastRound || { correct: [], skipped: [] };
    state.round.lastRound.skipped.push(word);
    io.emit('wordSkipped', { word });
  });

  socket.on('finishTurn', () => {
    if (socket.id !== adminSocketId) return;
    endCurrentTurn();
  });

  socket.on('finalizeGame', () => {
    if (socket.id !== adminSocketId) return;
    state.round.phase = 'finished';
    io.emit('state', publicState());
  });

  socket.on('endGameConfirm', (confirm) => {
    if (socket.id !== adminSocketId) return;
    if (confirm) {
      state.round.phase = 'final';
      io.emit('state', publicState());
    } else {
      state.round.phase = 'category';
      io.emit('state', publicState());
    }
  });

  socket.on('disconnect', () => {
    // remove player
    if (state.players[socket.id]) {
      delete state.players[socket.id];
      state.lobbyOrder = state.lobbyOrder.filter(sid => sid !== socket.id);
      state.teams.team1 = state.teams.team1.filter(sid => sid !== socket.id);
      state.teams.team2 = state.teams.team2.filter(sid => sid !== socket.id);

      if (socket.id === adminSocketId) {
        adminSocketId = null;
        // as admin left, reset state so players return to screen 1
        state = createNewState();
        io.emit('reset');
      } else {
        io.emit('state', publicState());
      }
    }
  });
});

// Helper functions
function publicState() {
  // prepare minimal state to send to clients
  const players = Object.fromEntries(Object.entries(state.players).map(([k, v]) => [k, { displayName: v.displayName, team: v.team }]));
  const categoriesRemaining = state.categories.filter(c => !state.usedWords[c.key] || state.usedWords[c.key].size < (state.availableWords[c.key] || []).length);
  return {
    players,
    lobbyOrder: state.lobbyOrder,
    teams: state.teams,
    categories: categoriesRemaining,
    scores: state.scores,
    round: state.round,
    adminSocketId
  };
}

function pickWord(categoryKey) {
  const pool = state.availableWords[categoryKey] || [];
  if (!pool.length) return null;
  const used = state.usedWords[categoryKey] || new Set();
  const available = pool.filter(w => !used.has(w));
  if (!available.length) return null;
  const word = available[Math.floor(Math.random() * available.length)];
  used.add(word);
  state.usedWords[categoryKey] = used;
  return word;
}

let countdown = null;
let countdownRemaining = 0;

function startTimerForActivePlayer() {
  const duration = 75;
  countdownRemaining = duration;
  state.round.phase = 'playing';
  state.round.lastRound = { correct: [], skipped: [] };
  io.emit('timerStart', { duration, activePlayer: state.round.activePlayerSocket });

  if (countdown) clearInterval(countdown);
  countdown = setInterval(() => {
    countdownRemaining -= 1;
    io.emit('timerTick', { remaining: countdownRemaining });
    if (countdownRemaining <= 0) {
      clearInterval(countdown);
      io.emit('timerEnd', { result: state.round.lastRound });
      // after timer ends, advance to review phase
      state.round.phase = 'review';
      io.emit('state', publicState());
    }
  }, 1000);
}

function startNextTurn() {
  // set active player socket based on rotation for current turnTeam
  const team = state.round.turnTeam;
  const members = state.teams[team];
  if (!members || members.length === 0) {
    // skip to other team
    state.round.turnTeam = team === 'team1' ? 'team2' : 'team1';
    return startNextTurn();
  }
  const idx = state.round.rotationIndex[team] % members.length;
  const sid = members[idx];
  state.round.activePlayerSocket = sid;
  state.round.phase = 'picking';
  io.emit('state', publicState());
}

function endCurrentTurn() {
  // mark category as used if both teams have played? We'll remove category when both teams played
  const cat = state.round.currentCategory;
  // rotate to next team or finish category
  if (state.round.turnTeam === 'team1') {
    state.round.turnTeam = 'team2';
  } else {
    // both teams finished: remove category from categories
    state.categories = state.categories.filter(c => c.key !== cat);
    // advance rotation indices for both teams
    state.round.rotationIndex.team1 = (state.round.rotationIndex.team1 + 1) % Math.max(1, state.teams.team1.length);
    state.round.rotationIndex.team2 = (state.round.rotationIndex.team2 + 1) % Math.max(1, state.teams.team2.length);
    // reset currentCategory to null so admin returns to categories screen
    state.round.currentCategory = null;
    state.round.turnTeam = null;
    state.round.activePlayerSocket = null;
    state.round.phase = 'category';
    io.emit('state', publicState());
    return;
  }
  // start next team's turn
  startNextTurn();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));