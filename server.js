const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const wordsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public','words.json'), 'utf8'));

let state = {
  players: {},
  team1: [],
  team2: [],
  scores: { team1: 0, team2: 0 },
  usedWords: new Set(),
  adminSocketId: null,
  currentCategoryKey: null,
  currentRoundPlayerId: null,
  roundTimer: null,
  roundEndTimestamp: null
};

function resetAll() {
  state.players = {};
  state.team1 = [];
  state.team2 = [];
  state.scores = { team1: 0, team2: 0 };
  state.usedWords = new Set();
  state.adminSocketId = null;
  state.currentCategoryKey = null;
  state.currentRoundPlayerId = null;
  if (state.roundTimer) {
    clearTimeout(state.roundTimer);
    state.roundTimer = null;
  }
  state.roundEndTimestamp = null;
}

function publicState() {
  return {
    players: Object.values(state.players).map(p => ({ id: p.id, name: p.displayName, team: p.team, isAdmin: p.isAdmin })),
    team1: state.team1,
    team2: state.team2,
    scores: state.scores,
    categories: [
      { key: "animais", label: "animais" },
      { key: "tv_cinema", label: "tv e cinema" },
      { key: "objetos", label: "objetos" },
      { key: "lugares", label: "lugares" },
      { key: "pessoas", label: "pessoas" },
      { key: "esportes_jogos", label: "esportes e jogos" },
      { key: "profissoes", label: "profissões" },
      { key: "alimentos", label: "alimentos" },
      { key: "personagens", label: "personagens" },
      { key: "biblico", label: "bíblico" }
    ]
  };
}

function pickWord(categoryKey) {
  const list = wordsData[categoryKey] || [];
  const remaining = list.filter(w => !state.usedWords.has(categoryKey + '||' + w));
  if (!remaining.length) return null;
  const idx = Math.floor(Math.random() * remaining.length);
  const word = remaining[idx];
  state.usedWords.add(categoryKey + '||' + word);
  return word;
}

io.on('connection', socket => {
  socket.on('join', payload => {
    const rawName = String(payload.name || '').trim();
    if (!rawName) return;
    const isAdmin = rawName.includes('995');
    const displayName = rawName.replace(/995/g, '').trim() || 'Admin';
    state.players[socket.id] = { id: socket.id, rawName, displayName, team: null, isAdmin };
    if (isAdmin) {
      state.adminSocketId = socket.id;
    }
    io.emit('state', publicState());
  });

  socket.on('joinTeam', team => {
    const p = state.players[socket.id];
    if (!p) return;
    if (team !== 'team1' && team !== 'team2') return;
    if (p.team === team) return;
    if (p.team === 'team1') {
      state.team1 = state.team1.filter(id => id !== socket.id);
    }
    if (p.team === 'team2') {
      state.team2 = state.team2.filter(id => id !== socket.id);
    }
    p.team = team;
    if (team === 'team1') state.team1.push(socket.id);
    if (team === 'team2') state.team2.push(socket.id);
    io.emit('state', publicState());
  });

  socket.on('showCategories', () => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    io.emit('showScreen', 2, publicState());
  });

  socket.on('selectCategory', key => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    if (!wordsData[key]) return;
    state.currentCategoryKey = key;
    io.emit('state', publicState());
  });

  socket.on('selectRoundPlayer', playerId => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    if (!state.players[playerId]) return;
    io.emit('selectedRoundPlayer', playerId);
  });

  socket.on('startRound', targetId => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    if (!state.currentCategoryKey) return;
    if (!state.players[targetId]) return;
    state.currentRoundPlayerId = targetId;
    const duration = 75000;
    state.roundEndTimestamp = Date.now() + duration;
    io.to(targetId).emit('showScreen', 3, { duration, categoryKey: state.currentCategoryKey });
    state.roundTimer = setTimeout(() => {
      state.currentRoundPlayerId = null;
      state.roundTimer = null;
      state.roundEndTimestamp = null;
      const summary = { usedWords: Array.from(state.usedWords), scores: state.scores };
      io.emit('roundEnded', summary);
    }, duration);
  });

  socket.on('requestWord', () => {
    const p = state.players[socket.id];
    if (!p) return;
    if (socket.id !== state.currentRoundPlayerId) return;
    const word = pickWord(state.currentCategoryKey);
    if (!word) {
      io.to(socket.id).emit('noWord');
      return;
    }
    io.to(socket.id).emit('word', word);
  });

  socket.on('acertou', () => {
    const p = state.players[socket.id];
    if (!p) return;
    if (socket.id !== state.currentRoundPlayerId) return;
    if (!p.team) return;
    state.scores[p.team] = (state.scores[p.team] || 0) + 1;
    io.emit('scores', state.scores);
    const word = pickWord(state.currentCategoryKey);
    if (!word) {
      io.to(socket.id).emit('noWord');
      return;
    }
    io.to(socket.id).emit('word', word);
  });

  socket.on('pular', () => {
    const p = state.players[socket.id];
    if (!p) return;
    if (socket.id !== state.currentRoundPlayerId) return;
    io.to(socket.id).emit('pularAck');
    setTimeout(() => {
      const word = pickWord(state.currentCategoryKey);
      if (!word) {
        io.to(socket.id).emit('noWord');
        return;
      }
      io.to(socket.id).emit('word', word);
    }, 3000);
  });

  socket.on('showCategoriesAll', () => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    io.emit('showScreen', 2, publicState());
  });

  socket.on('gotoScreen1All', () => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) return;
    resetAll();
    io.emit('resetToScreen1');
  });

  socket.on('disconnect', () => {
    const wasAdmin = state.adminSocketId === socket.id;
    delete state.players[socket.id];
    state.team1 = state.team1.filter(id => id !== socket.id);
    state.team2 = state.team2.filter(id => id !== socket.id);
    if (wasAdmin) {
      resetAll();
      io.emit('resetToScreen1');
    } else {
      io.emit('state', publicState());
    }
  });

  socket.emit('state', publicState());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
