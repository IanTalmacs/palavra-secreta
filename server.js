// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
app.use(express.static('public'));
let wordsData = JSON.parse(fs.readFileSync(__dirname + '/public/words.json', 'utf-8'));
function freshState() {
  return {
    players: {},
    order: [],
    lobby: [],
    teams: { team1: [], team2: [] },
    adminId: null,
    screen: 1,
    categories: Object.keys(wordsData),
    currentCategory: null,
    usedWords: new Set(),
    scores: { team1: 0, team2: 0 },
    round: null,
    chooser: null,
    chooserSocketId: null,
    turnHistory: [],
    timer: { remaining: 0, running: false },
    turnWords: { correct: [], skipped: [] },
    teamRotationIndex: { team1: 0, team2: 0 }
  };
}
let state = freshState();
function broadcastState() {
  const publicState = {
    players: state.players,
    order: state.order,
    lobby: state.lobby,
    teams: state.teams,
    isAdminConnected: !!state.adminId,
    screen: state.screen,
    categories: state.categories,
    currentCategory: state.currentCategory,
    scores: state.scores,
    round: state.round,
    chooser: state.chooser,
    timer: state.timer,
    turnWords: state.turnWords
  };
  io.emit('state', publicState);
}
function resetAll() {
  state = freshState();
  wordsData = JSON.parse(fs.readFileSync(__dirname + '/public/words.json', 'utf-8'));
  broadcastState();
}
io.on('connection', (socket) => {
  socket.on('join', (name) => {
    if (!name) return;
    const isAdmin = name.includes('9999');
    const visibleName = name.replace(/9999/g, '');
    state.players[socket.id] = { id: socket.id, name: visibleName, isAdmin: isAdmin };
    state.order.push(socket.id);
    state.lobby.push(socket.id);
    if (isAdmin) {
      state.adminId = socket.id;
      resetAll();
      state.players[socket.id] = { id: socket.id, name: visibleName, isAdmin: true };
      state.order = [socket.id];
      state.lobby = [socket.id];
      state.players[socket.id].screen = 1;
      io.to(socket.id).emit('joinedAsAdmin');
    }
    broadcastState();
    io.to(socket.id).emit('joined', socket.id);
  });
  socket.on('requestState', () => {
    broadcastState();
  });
  socket.on('movePlayer', ({ playerId, toTeam }) => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    const removeFrom = (arr, id) => {
      const idx = arr.indexOf(id);
      if (idx !== -1) arr.splice(idx, 1);
    };
    removeFrom(state.lobby, playerId);
    removeFrom(state.teams.team1, playerId);
    removeFrom(state.teams.team2, playerId);
    if (toTeam === 'lobby') state.lobby.push(playerId);
    else if (toTeam === 'team1') state.teams.team1.push(playerId);
    else if (toTeam === 'team2') state.teams.team2.push(playerId);
    broadcastState();
  });
  socket.on('startCategories', () => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    state.screen = 3;
    broadcastState();
  });
  socket.on('selectCategory', (category) => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (!state.categories.includes(category)) return;
    state.currentCategory = category;
    state.categories = state.categories.filter(c => c !== category);
    state.turnWords = { correct: [], skipped: [] };
    state.round = 'team1';
    state.screen = 4;
    state.chooser = getChooserForRound('team1');
    state.chooserSocketId = state.chooser;
    io.emit('prepareChooser', { chooserId: state.chooser, chooserName: state.players[state.chooser]?.name || '' });
    broadcastState();
  });
  function getChooserForRound(team) {
    const list = team === 'team1' ? state.teams.team1 : state.teams.team2;
    if (!list || list.length === 0) return null;
    const idx = state.teamRotationIndex[team];
    const chooserId = list[idx % list.length];
    return chooserId;
  }
  socket.on('startTurn', () => {
    if (socket.id !== state.chooserSocketId) return;
    startCountdown(75);
    pickNextWord();
    io.emit('turnStarted', { chooserId: state.chooserSocketId });
    broadcastState();
  });
  function pickNextWord() {
    const arr = wordsData[state.currentCategory] || [];
    const available = arr.filter(w => !state.usedWords.has(w));
    if (available.length === 0) {
      state.currentWord = null;
      io.emit('noMoreWords');
      return;
    }
    const w = available[Math.floor(Math.random() * available.length)];
    state.usedWords.add(w);
    state.currentWord = w;
    io.emit('newWord', w);
  }
  socket.on('correct', () => {
    if (socket.id !== state.chooserSocketId) return;
    if (!state.currentWord) return;
    state.turnWords.correct.push(state.currentWord);
    if (state.round === 'team1') state.scores.team1 += 1;
    else if (state.round === 'team2') state.scores.team2 += 1;
    pickNextWord();
    broadcastState();
  });
  socket.on('skip', () => {
    if (socket.id !== state.chooserSocketId) return;
    if (!state.currentWord) return;
    state.turnWords.skipped.push(state.currentWord);
    io.emit('skipping');
    setTimeout(() => {
      pickNextWord();
      broadcastState();
    }, 3000);
  });
  function startCountdown(seconds) {
    if (state.timer.running) return;
    state.timer.remaining = seconds;
    state.timer.running = true;
    broadcastState();
    state._interval = setInterval(() => {
      state.timer.remaining -= 1;
      if (state.timer.remaining <= 0) {
        clearInterval(state._interval);
        state.timer.running = false;
        endTurn();
      }
      io.emit('time', state.timer.remaining);
      broadcastState();
    }, 1000);
  }
  function endTurn() {
    state.screen = 6;
    clearInterval(state._interval);
    state.timer.running = false;
    state.timer.remaining = 0;
    state.turnHistory.push({ category: state.currentCategory, round: state.round, correct: state.turnWords.correct.slice(), skipped: state.turnWords.skipped.slice(), scores: { ...state.scores } });
    broadcastState();
  }
  socket.on('advanceAfterTurn', () => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (state.round === 'team1') {
      state.round = 'team2';
      state.turnWords = { correct: [], skipped: [] };
      state.chooser = getChooserForRound('team2');
      state.chooserSocketId = state.chooser;
      state.screen = 4;
      io.emit('prepareChooser', { chooserId: state.chooser, chooserName: state.players[state.chooser]?.name || '' });
      broadcastState();
      return;
    } else if (state.round === 'team2') {
      const t1 = state.teamRotationIndex.team1;
      const t2 = state.teamRotationIndex.team2;
      state.teamRotationIndex.team1 = t1 + 1;
      state.teamRotationIndex.team2 = t2 + 1;
      state.currentCategory = null;
      state.round = null;
      state.chooser = null;
      state.chooserSocketId = null;
      state.screen = 3;
      broadcastState();
      return;
    }
  });
  socket.on('finalizeGame', (confirm) => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (confirm) {
      state.screen = 7;
      broadcastState();
    } else {
      state.screen = 3;
      broadcastState();
    }
  });
  socket.on('adminAdvanceCategories', (action) => {
    if (!state.players[socket.id] || !state.players[socket.id].isAdmin) return;
    if (action === 'finish') {
      state.screen = 3;
      broadcastState();
    }
  });
  socket.on('disconnect', () => {
    if (!state.players[socket.id]) return;
    const wasAdmin = state.players[socket.id].isAdmin;
    delete state.players[socket.id];
    const idx = state.order.indexOf(socket.id);
    if (idx !== -1) state.order.splice(idx, 1);
    const arrRemove = (arr) => {
      const i = arr.indexOf(socket.id);
      if (i !== -1) arr.splice(i, 1);
    };
    arrRemove(state.lobby);
    arrRemove(state.teams.team1);
    arrRemove(state.teams.team2);
    if (wasAdmin) {
      resetAll();
    } else {
      broadcastState();
    }
  });
});
http.listen(process.env.PORT || 3000);
