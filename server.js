const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));

const WORDS = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'words.json'), 'utf8'));

// display names for categories (in order)
const CATEGORY_DISPLAY = [
  { key: 'animais', label: 'animais' },
  { key: 'tv_cinema', label: 'tv e cinema' },
  { key: 'objetos', label: 'objetos' },
  { key: 'lugares', label: 'lugares' },
  { key: 'pessoas', label: 'pessoas' },
  { key: 'esportes_jogos', label: 'esportes e jogos' },
  { key: 'profissoes', label: 'profissões' },
  { key: 'alimentos', label: 'alimentos' },
  { key: 'personagens', label: 'personagens' },
  { key: 'biblico', label: 'bíblico' }
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

let state = createNewState();

function createNewState() {
  const pool = {};
  for (const c of CATEGORY_DISPLAY) {
    pool[c.key] = Array.isArray(WORDS[c.key]) ? [...WORDS[c.key]] : [];
    shuffle(pool[c.key]);
  }
  return {
    players: {}, // socketId -> {id, name, displayName, isAdmin, team: 'lobby'|'team1'|'team2'}
    orderTeam1: [], // socketIds
    orderTeam2: [],
    teamScores: { team1: 0, team2: 0 },
    categoriesRemaining: CATEGORY_DISPLAY.map(c => c.key),
    wordsPool: pool,
    usedWords: new Set(),
    currentCategory: null,
    currentTurn: null, // { team: 'team1'|'team2', activePlayerId, timeLeft, timerRef, correctWords:[], skippedWords:[] }
    rotationIdx: { team1: 0, team2: 0 }
  };
}

function broadcastState() {
  const playersArr = Object.values(state.players).map(p => ({
    id: p.id,
    displayName: p.displayName,
    team: p.team,
    isAdmin: p.isAdmin
  }));
  io.emit('state', {
    players: playersArr,
    teamScores: state.teamScores,
    categoriesRemaining: state.categoriesRemaining,
    currentCategory: state.currentCategory,
    currentTurn: state.currentTurn ? {
      team: state.currentTurn.team,
      activePlayerId: state.currentTurn.activePlayerId,
      timeLeft: state.currentTurn.timeLeft
    } : null
  });
}

io.on('connection', socket => {
  socket.on('join', (rawName) => {
    const isAdmin = rawName.includes('9999');
    const displayName = rawName.replace(/9999/g, '').trim() || 'Jogador';
    state.players[socket.id] = {
      id: socket.id,
      name: rawName,
      displayName,
      isAdmin,
      team: 'lobby'
    };
    updateOrders();
    socket.emit('joined', { id: socket.id, isAdmin });
    broadcastState();
  });

  socket.on('assign-team', ({ playerId, team }) => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    if (!state.players[playerId]) return;
    if (!['lobby','team1','team2'].includes(team)) return;
    state.players[playerId].team = team;
    updateOrders();
    broadcastState();
  });

  socket.on('start-categories', () => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    io.emit('goto', { screen: 'categories' });
    broadcastState();
  });

  socket.on('select-category', (catKey) => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    if (!state.categoriesRemaining.includes(catKey)) return;
    state.currentCategory = catKey;
    state.currentTurn = null;
    // start with team1 first
    startTeamTurn('team1');
    broadcastState();
  });

  socket.on('start-turn', () => {
    if (!state.currentTurn) return;
    if (socket.id !== state.currentTurn.activePlayerId) return;
    beginCountdown();
  });

  socket.on('acertou', () => {
    if (!state.currentTurn) return;
    if (socket.id !== state.currentTurn.activePlayerId) return;
    // award point
    if (state.currentTurn.team === 'team1') state.teamScores.team1 += 1;
    else state.teamScores.team2 += 1;
    // mark current word as correct and pick next
    if (state.currentTurn.currentWord) {
      state.currentTurn.correctWords.push(state.currentTurn.currentWord);
    }
    pickAndSendNextWord();
    broadcastState();
  });

  socket.on('pular', () => {
    if (!state.currentTurn) return;
    if (socket.id !== state.currentTurn.activePlayerId) return;
    if (!state.currentTurn.currentWord) return;
    state.currentTurn.skippedWords.push(state.currentTurn.currentWord);
    // word is considered used; will not be drawn again
    state.usedWords.add(state.currentTurn.currentWord);
    // hide for 3s then send next
    io.emit('skip', { by: socket.id });
    state.currentTurn.currentWord = null;
    setTimeout(() => {
      pickAndSendNextWord();
      broadcastState();
    }, 3000);
  });

  socket.on('advance-after-turn', () => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    // determine whether next is team2 or finishing category
    if (!state.currentTurn) return;
    if (state.currentTurn.team === 'team1') {
      startTeamTurn('team2');
    } else {
      // both teams done for this category
      finishCategoryCycle();
    }
    broadcastState();
  });

  socket.on('finalizar', () => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    io.emit('confirm-finish');
  });

  socket.on('confirm-finish', (confirm) => {
    const caller = state.players[socket.id];
    if (!caller || !caller.isAdmin) return;
    if (confirm === true) {
      io.emit('game-over', { teamScores: state.teamScores });
      // reset everything after finishing
      state = createNewState();
      broadcastState();
    } else {
      // back to categories screen
      io.emit('goto', { screen: 'categories' });
    }
  });

  socket.on('disconnect', () => {
    const leaving = state.players[socket.id];
    if (leaving && leaving.isAdmin) {
      // reset everything and notify clients
      state = createNewState();
      io.emit('reset'); // clients should go to screen 1
      return;
    }
    delete state.players[socket.id];
    updateOrders();
    broadcastState();
  });
});

function updateOrders() {
  state.orderTeam1 = [];
  state.orderTeam2 = [];
  for (const p of Object.values(state.players)) {
    if (p.team === 'team1') state.orderTeam1.push(p.id);
    else if (p.team === 'team2') state.orderTeam2.push(p.id);
  }
  // keep rotation idx in range
  if (state.rotationIdx.team1 >= state.orderTeam1.length) state.rotationIdx.team1 = 0;
  if (state.rotationIdx.team2 >= state.orderTeam2.length) state.rotationIdx.team2 = 0;
}

function startTeamTurn(team) {
  // set up currentTurn object, select active player by rotation
  const order = team === 'team1' ? state.orderTeam1 : state.orderTeam2;
  if (order.length === 0) {
    // no players: skip immediately
    state.currentTurn = {
      team,
      activePlayerId: null,
      timeLeft: 0,
      correctWords: [],
      skippedWords: []
    };
    return;
  }
  const idxKey = team === 'team1' ? 'team1' : 'team2';
  const idx = state.rotationIdx[idxKey] % order.length;
  const activePlayerId = order[idx];
  // advance rotation for next time
  state.rotationIdx[idxKey] = (state.rotationIdx[idxKey] + 1) % Math.max(order.length,1);

  state.currentTurn = {
    team,
    activePlayerId,
    timeLeft: 75,
    timerRef: null,
    correctWords: [],
    skippedWords: [],
    currentWord: null
  };

  io.emit('goto', { screen: 'prepare', activePlayerId, team });
  broadcastState();
}

function beginCountdown() {
  if (!state.currentTurn) return;
  if (state.currentTurn.timerRef) return;
  // send first word
  pickAndSendNextWord();

  state.currentTurn.timerRef = setInterval(() => {
    if (!state.currentTurn) return;
    state.currentTurn.timeLeft -= 1;
    io.emit('time-update', { timeLeft: state.currentTurn.timeLeft });

    if (state.currentTurn.timeLeft <= 0) {
      clearInterval(state.currentTurn.timerRef);
      state.currentTurn.timerRef = null;
      const result = {
        correctWords: state.currentTurn.correctWords.slice(),
        skippedWords: state.currentTurn.skippedWords.slice()
      };
      io.emit('turn-ended', result);
      // store used words (skipped already added earlier; correctWords must be added)
      for (const w of result.correctWords) state.usedWords.add(w);
      // currentTurn remains until admin advances (server keeps it to allow 'avançar' control)
    } else {
      // nothing
    }
    if (state.currentTurn && state.currentTurn.timeLeft === 5) {
      io.emit('time-is-five');
    }
  }, 1000);
}

function pickAndSendNextWord() {
  const cat = state.currentCategory;
  if (!cat) {
    io.emit('no-more-words');
    return;
  }
  const pool = state.wordsPool[cat] || [];
  // remove used words already from pool
  while (pool.length && state.usedWords.has(pool[pool.length - 1])) pool.pop();
  if (pool.length === 0) {
    // no words left in this category
    state.currentTurn.currentWord = null;
    io.emit('no-more-words');
    return;
  }
  // pick last (already shuffled)
  const w = pool.pop();
  if (!w) {
    state.currentTurn.currentWord = null;
    io.emit('no-more-words');
    return;
  }
  state.usedWords.add(w);
  state.currentTurn.currentWord = w;
  io.emit('new-word', { word: w });
}

function finishCategoryCycle() {
  // remove currentCategory from remaining
  state.categoriesRemaining = state.categoriesRemaining.filter(c => c !== state.currentCategory);
  state.currentCategory = null;
  state.currentTurn = null;
  // go back to categories screen
  io.emit('goto', { screen: 'categories' });
  broadcastState();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('listening on', PORT);
});
