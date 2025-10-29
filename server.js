const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// load words (full set)
const WORDS_FILE = path.join(__dirname, 'public', 'words.json');
let WORDS_FULL = {};
try {
  WORDS_FULL = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));
} catch (e) {
  console.error('Erro ao carregar words.json', e);
  process.exit(1);
}

// Utility functions
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Server game state (in-memory, temporary)
let players = []; // {id, socketId, name, displayName, team: 'lobby'|'team1'|'team2', isAdmin}
let scores = { team1: 0, team2: 0 };
let usedWords = new Set();
let categoriesSelected = Object.keys(WORDS_FULL); // by default all
let round = {
  active: false,
  currentPlayerId: null,
  currentWord: null,
  wordHistory: [], // {word, status: 'correct'|'skipped'}
  endTime: null,
  timerInterval: null,
  skipUntil: null
};
let selectedPlayerId = null;

function resetAllBecauseAdminLeft() {
  // Clear everything and force clients to screen1 (they must re-join)
  players = [];
  scores = { team1: 0, team2: 0 };
  usedWords = new Set();
  categoriesSelected = Object.keys(WORDS_FULL);
  round = {
    active: false,
    currentPlayerId: null,
    currentWord: null,
    wordHistory: [],
    endTime: null,
    timerInterval: null,
    skipUntil: null
  };
  selectedPlayerId = null;
  io.emit('forceReset'); // clients will go back to screen 1
}

function pickNextWord() {
  // gather available words from categoriesSelected excluding usedWords
  let pool = [];
  categoriesSelected.forEach(cat => {
    const list = WORDS_FULL[cat] || [];
    list.forEach(w => {
      if (!usedWords.has(w)) pool.push({ word: w, category: cat });
    });
  });
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  const chosen = pool[idx].word;
  usedWords.add(chosen);
  return chosen;
}

function broadcastState() {
  io.emit('state', {
    players: players.map(p => ({
      id: p.id,
      displayName: p.displayName,
      team: p.team,
      isAdmin: p.isAdmin
    })),
    scores,
    selectedPlayerId,
    roundActive: round.active,
    roundInfo: {
      currentPlayerId: round.currentPlayerId,
      currentWord: round.currentWord,
      wordHistory: round.wordHistory,
      endTime: round.endTime,
      skipUntil: round.skipUntil
    },
    categoriesAvailable: Object.keys(WORDS_FULL),
    categoriesSelected
  });
}

// Helper to find admin socket (first admin)
function findAdminSocket() {
  const admin = players.find(p => p.isAdmin);
  if (!admin) return null;
  return io.sockets.sockets.get(admin.socketId) || null;
}

// Socket.IO
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join', (name, cb) => {
    if (!name || typeof name !== 'string') {
      return cb && cb({ ok: false, error: 'Nome inválido' });
    }

    // If someone else is already using this socket id (unlikely), ignore
    const existing = players.find(p => p.socketId === socket.id);
    if (existing) {
      return cb && cb({ ok: true });
    }

    const isAdmin = name.includes('999');
    const displayName = name.replace(/999/g, '').trim() || 'Admin';

    const player = {
      id: socket.id, // use socket.id as player id
      socketId: socket.id,
      name,
      displayName,
      team: 'lobby',
      isAdmin
    };
    players.push(player);

    socket.data.playerId = player.id;
    socket.data.isAdmin = isAdmin;

    console.log(`player joined: ${displayName} admin:${isAdmin}`);

    // If an admin joined previously everything continues.
    // Broadcast updated state
    broadcastState();

    cb && cb({ ok: true, playerId: player.id, isAdmin });
  });

  socket.on('setCategories', (cats) => {
    // only admin can change categories
    const p = players.find(x => x.socketId === socket.id);
    if (!p || !p.isAdmin) return;
    if (!Array.isArray(cats)) return;
    const sanitized = cats.filter(c => Object.keys(WORDS_FULL).includes(c));
    categoriesSelected = sanitized.length ? sanitized : Object.keys(WORDS_FULL);
    broadcastState();
  });

  socket.on('movePlayer', ({ playerId, team }) => {
    const p = players.find(x => x.socketId === socket.id);
    if (!p || !p.isAdmin) return; // only admin
    const target = players.find(x => x.id === playerId);
    if (!target) return;
    if (!['lobby', 'team1', 'team2'].includes(team)) return;
    target.team = team;
    broadcastState();
  });

  socket.on('selectPlayer', (playerId) => {
    const p = players.find(x => x.socketId === socket.id);
    if (!p || !p.isAdmin) return;
    const target = players.find(x => x.id === playerId);
    if (!target) return;
    selectedPlayerId = playerId;
    broadcastState();
  });

  socket.on('startRound', () => {
    // Only selected player (not admin-only) can start the round
    const p = players.find(x => x.socketId === socket.id);
    if (!p || p.id !== selectedPlayerId) return;

    if (round.active) return;

    // Prepare round
    round.active = true;
    round.currentPlayerId = selectedPlayerId;
    round.wordHistory = [];
    round.skipUntil = null;
    round.endTime = Date.now() + 75000; // 75 seconds
    round.currentWord = pickNextWord();

    // start timer
    round.timerInterval = setInterval(() => {
      const remaining = round.endTime - Date.now();
      if (remaining <= 0) {
        clearInterval(round.timerInterval);
        round.timerInterval = null;
        round.active = false;
        round.currentWord = null;
        round.skipUntil = null;
        // emit roundEnded
        io.emit('roundEnded', {
          wordHistory: round.wordHistory,
          scores
        });
        // deselect player (admin will choose next)
        selectedPlayerId = null;
        broadcastState();
      } else {
        broadcastState(); // includes endTime so clients can sync
      }
    }, 250);

    io.emit('roundStarted', {
      currentPlayerId: round.currentPlayerId,
      endTime: round.endTime
    });

    broadcastState();
  });

  socket.on('correct', () => {
    const p = players.find(x => x.socketId === socket.id);
    if (!p) return;
    if (!round.active) return;
    if (p.id !== round.currentPlayerId) return;

    // count point for the team of the current player
    const teamKey = (p.team === 'team2') ? 'team2' : 'team1';
    scores[teamKey] = (scores[teamKey] || 0) + 1;

    // save word as correct
    if (round.currentWord) {
      round.wordHistory.push({ word: round.currentWord, status: 'correct' });
    }

    // pick next word immediately
    const next = pickNextWord();
    round.currentWord = next;
    broadcastState();
  });

  socket.on('skip', () => {
    const p = players.find(x => x.socketId === socket.id);
    if (!p) return;
    if (!round.active) return;
    if (p.id !== round.currentPlayerId) return;

    // when skip pressed, word & buttons disappear for 3s
    if (round.currentWord) {
      round.wordHistory.push({ word: round.currentWord, status: 'skipped' });
    }

    round.currentWord = null;
    round.skipUntil = Date.now() + 3000;

    broadcastState();

    setTimeout(() => {
      // if round still active, pick next
      if (!round.active) return;
      round.skipUntil = null;
      const next = pickNextWord();
      round.currentWord = next;
      broadcastState();
    }, 3000);
  });

  socket.on('adminAdvance', () => {
    // admin-only: used to move everyone to next screen (general use)
    const p = players.find(x => x.socketId === socket.id);
    if (!p || !p.isAdmin) return;
    // For simplicity we just broadcast a generic 'adminAdvance' event
    io.emit('adminAdvance');
  });

  socket.on('endResultsNext', () => {
    // admin-only: after screen 6, admin moves everyone back to lobby for next selection
    const p = players.find(x => x.socketId === socket.id);
    if (!p || !p.isAdmin) return;

    // clear current round data but keep scores and player teams
    round.active = false;
    round.currentPlayerId = null;
    round.currentWord = null;
    round.wordHistory = [];
    round.endTime = null;
    round.skipUntil = null;
    // do NOT clear usedWords (words already used must remain used across rounds)
    selectedPlayerId = null;
    broadcastState();
    io.emit('goToLobby');
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnect', socket.id, reason);
    const pIndex = players.findIndex(x => x.socketId === socket.id);
    if (pIndex !== -1) {
      const wasAdmin = players[pIndex].isAdmin;
      players.splice(pIndex, 1);
      if (wasAdmin) {
        // Reset everything if the admin leaves/refreshes
        console.log('Admin left — resetting game to screen 1 for everyone.');
        resetAllBecauseAdminLeft();
      } else {
        broadcastState();
      }
    }
  });

  // send current state to the new socket
  socket.emit('state', {
    players: players.map(p => ({
      id: p.id,
      displayName: p.displayName,
      team: p.team,
      isAdmin: p.isAdmin
    })),
    scores,
    selectedPlayerId,
    roundActive: round.active,
    roundInfo: {
      currentPlayerId: round.currentPlayerId,
      currentWord: round.currentWord,
      wordHistory: round.wordHistory,
      endTime: round.endTime,
      skipUntil: round.skipUntil
    },
    categoriesAvailable: Object.keys(WORDS_FULL),
    categoriesSelected
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
