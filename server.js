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

// Load words.json once (words are in /public/words.json but we'll read a copy)
const WORDS_FILE = path.join(__dirname, 'public', 'words.json');
let wordsDB = {};
try {
  wordsDB = JSON.parse(fs.readFileSync(WORDS_FILE));
} catch (e) {
  console.error('Erro lendo words.json', e);
}

// Global in-memory state (resets when server restarts)
let state = {
  screen: 1, // 1..6
  players: {}, // id -> {id, name, isAdmin, team: 'lobby'|'team1'|'team2'}
  lobbyOrder: [], // array of player ids (order)
  team1: [],
  team2: [],
  adminId: null,
  categoriesSelected: [], // array of category keys
  wordsPool: [], // remaining words (objects like {text, category})
  usedWords: [], // used words with status
  currentRound: {
    selectedPlayerId: null,
    currentWord: null,
    remaining: 0,
    running: false,
    wordStatuses: [] // {word, status: 'correct'|'skipped'}
  },
  scores: { team1: 0, team2: 0 }
};

function resetState() {
  state = {
    screen: 1,
    players: {},
    lobbyOrder: [],
    team1: [],
    team2: [],
    adminId: null,
    categoriesSelected: [],
    wordsPool: [],
    usedWords: [],
    currentRound: {
      selectedPlayerId: null,
      currentWord: null,
      remaining: 0,
      running: false,
      wordStatuses: []
    },
    scores: { team1: 0, team2: 0 }
  };
}

function buildWordsPool(categories) {
  const pool = [];
  if (!categories || categories.length === 0) return pool;
  for (const cat of categories) {
    const arr = wordsDB[cat] || [];
    for (const w of arr) pool.push({ text: w, category: cat });
  }
  return shuffle(pool);
}

function shuffle(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let tickInterval = null;

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // send initial state
  socket.emit('state', sanitizeStateFor(socket.id));

  // join (set name)
  socket.on('setName', (payload) => {
    // payload: { name }
    if (!payload || typeof payload.name !== 'string') return;
    let raw = payload.name.trim();
    if (!raw) return;

    let isAdmin = false;
    if (raw.includes('9999')) {
      isAdmin = true;
      raw = raw.replace(/9999/g, '').trim();
    }

    // Add player
    state.players[socket.id] = {
      id: socket.id,
      name: raw || 'Jogador',
      isAdmin,
      team: 'lobby'
    };
    state.lobbyOrder.push(socket.id);

    if (isAdmin) {
      state.adminId = socket.id;
    }

    io.emit('state', sanitizeStateForAll());
  });

  // Admin moves player between lists (drag/drop)
  socket.on('movePlayer', ({ playerId, to }) => {
    if (socket.id !== state.adminId) return;
    if (!state.players[playerId]) return;
    // remove from previous
    const prev = state.players[playerId].team;
    // remove from arrays
    const removeFrom = (arr, id) => {
      const i = arr.indexOf(id);
      if (i !== -1) arr.splice(i, 1);
    };
    removeFrom(state.lobbyOrder, playerId);
    removeFrom(state.team1, playerId);
    removeFrom(state.team2, playerId);

    // assign
    if (to === 'team1') {
      state.players[playerId].team = 'team1';
      state.team1.push(playerId);
    } else if (to === 'team2') {
      state.players[playerId].team = 'team2';
      state.team2.push(playerId);
    } else {
      state.players[playerId].team = 'lobby';
      state.lobbyOrder.push(playerId);
    }

    io.emit('state', sanitizeStateForAll());
  });

  // Admin toggles categories (screen 3)
  socket.on('toggleCategory', (cat) => {
    if (socket.id !== state.adminId) return;
    if (!wordsDB[cat]) return;
    const idx = state.categoriesSelected.indexOf(cat);
    if (idx === -1) state.categoriesSelected.push(cat);
    else state.categoriesSelected.splice(idx, 1);
    io.emit('state', sanitizeStateForAll());
  });

  // Admin opens categories screen or other navigation (advance screen)
  socket.on('gotoScreen', (n) => {
    // Only admin can navigate screens (except exceptions handled on client)
    if (socket.id !== state.adminId) return;
    // if moving to screen 3 from 2, we keep current selection
    state.screen = n;
    // when entering screen 3 no action, but when returning to screen 2 keep state
    // Build words pool if moving forward beyond categories and none built
    if ((n === 4 || n === 2 || n === 3) && state.wordsPool.length === 0) {
      // don't autobuild until admin confirms categories; we'll build on demand
    }
    io.emit('state', sanitizeStateForAll());
  });

  // Admin finalizes categories and builds pool (open screen 4)
  socket.on('finalizeCategories', () => {
    if (socket.id !== state.adminId) return;
    state.wordsPool = buildWordsPool(state.categoriesSelected);
    state.usedWords = [];
    state.currentRound = {
      selectedPlayerId: null,
      currentWord: null,
      remaining: 0,
      running: false,
      wordStatuses: []
    };
    state.screen = 4;
    io.emit('state', sanitizeStateForAll());
  });

  // Admin selects a player (highlights). Only admin can select player.
  socket.on('selectPlayerForTurn', (playerId) => {
    if (socket.id !== state.adminId) return;
    if (!state.players[playerId]) return;
    state.currentRound.selectedPlayerId = playerId;
    io.emit('state', sanitizeStateForAll());
  });

  // The selected player clicks 'iniciar' -> start timer and round.
  socket.on('startRound', () => {
    const pid = state.currentRound.selectedPlayerId;
    if (!pid || socket.id !== pid) return; // only the selected player can start
    if (state.currentRound.running) return;

    // Build wordsPool if empty (fallback)
    if (!state.wordsPool || state.wordsPool.length === 0) {
      state.wordsPool = buildWordsPool(state.categoriesSelected);
      state.usedWords = [];
    }

    // start round
    state.currentRound.running = true;
    state.currentRound.remaining = 75;
    state.currentRound.wordStatuses = [];
    state.currentRound.currentWord = drawWord();

    // tick interval
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      state.currentRound.remaining -= 1;
      io.emit('tick', {
        remaining: state.currentRound.remaining
      });

      // when 5 seconds left, clients will hide 'pular' per UI
      if (state.currentRound.remaining <= 0) {
        endRound();
      }
    }, 1000);

    io.emit('state', sanitizeStateForAll());
  });

  // Selected player clicked 'acertou'
  socket.on('correct', () => {
    const pid = state.currentRound.selectedPlayerId;
    if (!pid || socket.id !== pid) return;
    if (!state.currentRound.running) return;
    const word = state.currentRound.currentWord;
    if (!word) return;

    // add score to team of player
    const player = state.players[pid];
    const team = player.team === 'team1' ? 'team1' : player.team === 'team2' ? 'team2' : null;
    if (team) state.scores[team] = (state.scores[team] || 0) + 1;

    // mark used correct
    state.currentRound.wordStatuses.push({ word: word.text, status: 'correct' });
    state.usedWords.push(word);
    state.currentRound.currentWord = drawWord();

    io.emit('state', sanitizeStateForAll());
  });

  // Selected player clicked 'pular'
  socket.on('skip', () => {
    const pid = state.currentRound.selectedPlayerId;
    if (!pid || socket.id !== pid) return;
    if (!state.currentRound.running) return;
    const word = state.currentRound.currentWord;
    if (!word) return;

    // mark skipped
    state.currentRound.wordStatuses.push({ word: word.text, status: 'skipped' });
    state.usedWords.push(word);
    // hide for 3s for everyone
    io.emit('skip-start');
    state.currentRound.currentWord = null;
    io.emit('state', sanitizeStateForAll());

    setTimeout(() => {
      // draw next word
      state.currentRound.currentWord = drawWord();
      io.emit('skip-end');
      io.emit('state', sanitizeStateForAll());
    }, 3000);
  });

  // Admin can advance manually to screen 6 (or others)
  socket.on('endRoundByAdmin', () => {
    if (socket.id !== state.adminId) return;
    endRound();
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const wasAdmin = state.adminId === socket.id;
    // remove player
    if (state.players[socket.id]) {
      delete state.players[socket.id];
      const removeFrom = (arr, id) => {
        const i = arr.indexOf(id);
        if (i !== -1) arr.splice(i, 1);
      };
      removeFrom(state.lobbyOrder, socket.id);
      removeFrom(state.team1, socket.id);
      removeFrom(state.team2, socket.id);
    }

    if (wasAdmin) {
      // If admin disconnects, reset all state (as requested)
      resetState();
      io.emit('state', sanitizeStateForAll());
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      return;
    }

    io.emit('state', sanitizeStateForAll());
  });

  // helper to send sanitized state
  function sanitizeStateFor(sid) {
    // Return full state, but don't send usedWords full objects if not needed.
    const playersList = Object.values(state.players).map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      isAdmin: p.id === state.adminId
    }));

    return {
      screen: state.screen,
      players: playersList,
      lobbyOrder: state.lobbyOrder.slice(),
      team1: state.team1.slice(),
      team2: state.team2.slice(),
      adminId: state.adminId,
      categoriesSelected: state.categoriesSelected.slice(),
      wordsLeftCount: state.wordsPool.length,
      currentRound: {
        selectedPlayerId: state.currentRound.selectedPlayerId,
        // send full currentWord only if the requester is the chosen player (they need to see it)
        currentWord: (sid === state.currentRound.selectedPlayerId ? state.currentRound.currentWord : (state.currentRound.running ? null : null)),
        remaining: state.currentRound.remaining,
        running: state.currentRound.running,
        wordStatuses: state.currentRound.wordStatuses.slice()
      },
      scores: state.scores
    };
  }

  function sanitizeStateForAll() {
    // produce a state object that can be used to broadcast to all,
    // but clients will decide if they can see currentWord based on socket id they have.
    return {
      screen: state.screen,
      players: Object.values(state.players).map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isAdmin: p.id === state.adminId
      })),
      lobbyOrder: state.lobbyOrder.slice(),
      team1: state.team1.slice(),
      team2: state.team2.slice(),
      adminId: state.adminId,
      categoriesSelected: state.categoriesSelected.slice(),
      wordsLeftCount: state.wordsPool.length,
      currentRound: {
        selectedPlayerId: state.currentRound.selectedPlayerId,
        // don't include currentWord here (clients get it via state and will request if they are chosen),
        // but we'll send null - chosen client sees word via separate targeted emit below.
        currentWord: null,
        remaining: state.currentRound.remaining,
        running: state.currentRound.running,
        wordStatuses: state.currentRound.wordStatuses.slice()
      },
      scores: state.scores
    };
  }

  // If chosen player exists and currentWord present, emit targeted update to that socket
  function emitChosenWordToPlayer() {
    const pid = state.currentRound.selectedPlayerId;
    if (!pid) return;
    const word = state.currentRound.currentWord; // may be {text, category}
    io.to(pid).emit('chosenWord', { currentWord: word, remaining: state.currentRound.remaining });
  }

  // draws next word from pool
  function drawWord() {
    if (!state.wordsPool || state.wordsPool.length === 0) return null;
    // pick random index
    const idx = Math.floor(Math.random() * state.wordsPool.length);
    const w = state.wordsPool.splice(idx, 1)[0];
    return w;
  }

  // end round
  function endRound() {
    if (!state.currentRound.running) return;
    state.currentRound.running = false;
    state.currentRound.remaining = 0;
    // merge usedWords? We have wordStatuses in currentRound
    // move to screen 6
    state.screen = 6;
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    io.emit('roundEnded', {
      wordStatuses: state.currentRound.wordStatuses,
      scores: state.scores
    });
    io.emit('state', sanitizeStateForAll());
  }

  // Whenever state changes and there is a chosen player with a word, send chosenWord to them
  socket.onAny((event, ...args) => {
    // small debounce: after any event, send chosen word if exists
    setTimeout(() => emitChosenWordToPlayer(), 50);
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
