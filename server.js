const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Load words.json
const WORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'words.json'), 'utf8'));
const CATEGORIES = Object.keys(WORDS);

// Global ephemeral state (resets if server restarts or admin disconnects)
let state = createInitialState();

function createInitialState() {
  return {
    screen: 1,
    players: {}, // socketId -> { id, name, displayName, team: 'lobby'|'team1'|'team2', isAdmin }
    adminSocketId: null,
    adminName: null,
    teams: {
      team1: [],
      team2: [],
      lobby: []
    },
    scores: { team1: 0, team2: 0 },
    categories: CATEGORIES.slice(), // all selected by default
    usedWords: new Set(),
    round: null // when round active: { activePlayerId, endTime, currentWord, correct:[], skipped:[] }
  };
}

function resetAll() {
  state = createInitialState();
  io.emit('reset-to-screen-1');
}

// Helper: pick random word from selected categories not used yet
function pickWord() {
  const avail = [];
  for (const cat of state.categories) {
    const list = WORDS[cat] || [];
    for (const w of list) {
      if (!state.usedWords.has(w)) avail.push({ word: w, cat });
    }
  }
  if (!avail.length) return null;
  const pick = avail[Math.floor(Math.random() * avail.length)];
  state.usedWords.add(pick.word);
  return pick.word;
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // on join: client sends name
  socket.on('join', (name) => {
    if (!name || typeof name !== 'string') name = 'Jogador';
    const isAdmin = name.includes('999');
    const cleanName = name.replace(/999/g, ''); // remove 999 from display

    // if someone joins with admin token while admin already exists, still set new admin
    if (isAdmin) {
      // set admin socket id
      state.adminSocketId = socket.id;
      state.adminName = cleanName || 'Admin';
      // if admin connects when there were no players, fine
    }

    state.players[socket.id] = {
      id: socket.id,
      name,
      displayName: cleanName || 'Player',
      team: 'lobby',
      isAdmin
    };
    state.teams.lobby.push(socket.id);

    // If no admin present, cannot go past screen 1. If an admin just connected and the screen was 1, keep 1 but admin can advance.

    // Send state to this client
    socket.emit('init-state', serializeStateFor(socket.id));

    // notify others of player list change
    io.emit('players-updated', serializeStateFor());
  });

  socket.on('admin-next-screen', () => {
    if (socket.id !== state.adminSocketId) return; // only admin
    // Only advance if rules allow (e.g., screen 1 requires admin existence)
    if (state.screen === 1) {
      // require admin to exist
      if (!state.adminSocketId) return;
    }
    state.screen = Math.min(6, state.screen + 1);

    // If advancing to screen 5 (round), admin must have selected a player. But we handle selection separately.

    io.emit('screen-changed', { screen: state.screen, meta: {} });
  });

  // admin moves player to team
  socket.on('move-player', ({ playerId, to }) => {
    if (socket.id !== state.adminSocketId) return;
    if (!state.players[playerId]) return;
    const from = state.players[playerId].team;
    if (from === to) return;
    // remove from old team array
    state.teams[from] = state.teams[from].filter(id => id !== playerId);
    state.players[playerId].team = to;
    state.teams[to].push(playerId);
    io.emit('players-updated', serializeStateFor());
  });

  // admin selects active player for round
  socket.on('admin-select-player', ({ playerId }) => {
    if (socket.id !== state.adminSocketId) return;
    if (!state.players[playerId]) return;
    // set active player but do not start round yet
    if (!state.round) state.round = {};
    state.round.activePlayerId = playerId;
    io.emit('active-player-selected', { playerId });
  });

  // the chosen player presses start
  socket.on('player-start-round', () => {
    // only allow if this socket is the active player
    if (!state.round || socket.id !== state.round.activePlayerId) return;

    // start round: pick a word and set endTime
    const durationMs = 75 * 1000;
    const now = Date.now();
    const endTime = now + durationMs;
    const word = pickWord();
    state.round.endTime = endTime;
    state.round.currentWord = word;
    state.round.correct = [];
    state.round.skipped = [];

    // send start-round to all with endTime and active player id
    io.emit('round-started', { activePlayerId: state.round.activePlayerId, endTime, currentWord: word });

    // schedule hide skip button at 5s left -> we will set a timeout
    const hideSkipMs = durationMs - 5000;
    if (hideSkipMs > 0) {
      setTimeout(() => {
        io.emit('hide-skip');
      }, hideSkipMs);
    }

    // schedule end of round
    setTimeout(() => {
      endCurrentRound();
    }, durationMs + 100); // small buffer
  });

  socket.on('round-acertou', () => {
    if (!state.round) return;
    const sid = socket.id;
    if (sid !== state.round.activePlayerId) return; // only active player can press
    // add point to player's team
    const player = state.players[sid];
    if (!player) return;
    const teamKey = player.team === 'team1' ? 'team1' : 'team2';
    state.scores[teamKey] = (state.scores[teamKey] || 0) + 1;
    state.round.correct.push(state.round.currentWord);
    // immediate new word (if available)
    const next = pickWord();
    state.round.currentWord = next;
    io.emit('round-update', { action: 'acertou', nextWord: next, scores: state.scores, correct: state.round.correct.slice(), skipped: state.round.skipped.slice() });
  });

  socket.on('round-pular', () => {
    if (!state.round) return;
    const sid = socket.id;
    if (sid !== state.round.activePlayerId) return; // only active player
    state.round.skipped.push(state.round.currentWord);
    io.emit('round-update', { action: 'pular', scores: state.scores, correct: state.round.correct.slice(), skipped: state.round.skipped.slice() });
    // after 3s, send next word
    setTimeout(() => {
      const next = pickWord();
      state.round.currentWord = next;
      io.emit('round-resume', { nextWord: next });
    }, 3000);
  });

  socket.on('request-state', () => {
    socket.emit('init-state', serializeStateFor(socket.id));
  });

  socket.on('select-categories', ({ categories }) => {
    // admin only
    if (socket.id !== state.adminSocketId) return;
    // validate categories
    const good = (categories || []).filter(c => CATEGORIES.includes(c));
    state.categories = good.length ? good : CATEGORIES.slice();
    io.emit('categories-updated', { categories: state.categories });
  });

  socket.on('admin-reset', () => {
    if (socket.id !== state.adminSocketId) return;
    resetAll();
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const wasAdmin = socket.id === state.adminSocketId;
    // remove player
    if (state.players[socket.id]) {
      const team = state.players[socket.id].team;
      state.teams[team] = state.teams[team].filter(id => id !== socket.id);
      delete state.players[socket.id];
    }
    io.emit('players-updated', serializeStateFor());

    if (wasAdmin) {
      // admin left -> reset everything as required
      resetAll();
    }
  });
});

function endCurrentRound() {
  // notify clients to go to screen 6 and provide round results
  if (!state.round) return;
  const roundData = {
    correct: state.round.correct || [],
    skipped: state.round.skipped || [],
    scores: state.scores
  };
  // clear round
  state.round = null;
  // move to screen 6
  state.screen = 6;
  io.emit('round-ended', roundData);
}

function serializeStateFor(socketId) {
  // produce a safe state object for clients
  const players = Object.values(state.players).map(p => ({ id: p.id, displayName: p.displayName, team: p.team, isAdmin: p.isAdmin }));
  return {
    screen: state.screen,
    players,
    teams: {
      team1: state.teams.team1.slice(),
      team2: state.teams.team2.slice(),
      lobby: state.teams.lobby.slice()
    },
    scores: state.scores,
    categories: state.categories,
    adminSocketId: state.adminSocketId,
    adminName: state.adminName,
    activePlayerId: state.round ? state.round.activePlayerId : null,
    usedCount: state.usedWords.size
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on port', PORT));