const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Load words file (categories -> array)
const wordsPath = path.join(__dirname, 'public', 'words.json');
let WORDS_BY_CATEGORY = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));

// GAME STATE (in-memory)
let state = {
  players: {}, // socketId -> {id, name, displayName, isAdmin, team: 'lobby'|'team1'|'team2'}
  adminId: null, // socket id of admin
  categories: Object.keys(WORDS_BY_CATEGORY), // available categories
  usedWords: new Set(),
  scores: { team1: 0, team2: 0 },
  round: {
    active: false,
    category: null,
    teamTurn: null, // 'team1' or 'team2' — which team is currently playing
    chosenPlayerId: null, // socket id of chosen player for this turn
    endTime: null,
    currentWord: null,
    wordsLog: [] // {word, status: 'correct'|'skipped'}
  },
  rotationIndex: { team1: 0, team2: 0 }
};

// Helper: broadcast full state (sanitized) to all clients
function publicState() {
  const playersList = Object.values(state.players).map(p => ({
    id: p.id,
    name: p.displayName,
    team: p.team,
    isAdmin: p.isAdmin
  }));
  return {
    players: playersList,
    categories: state.categories,
    scores: state.scores,
    round: {
      active: state.round.active,
      category: state.round.category,
      teamTurn: state.round.teamTurn,
      chosenPlayerId: state.round.chosenPlayerId,
      endTime: state.round.endTime,
      currentWord: state.round.currentWord,
      wordsLog: state.round.wordsLog
    }
  };
}

// Utility: pick a random unused word from category
function pickWord(category) {
  const pool = WORDS_BY_CATEGORY[category] || [];
  const unused = pool.filter(w => !state.usedWords.has(w));
  if (unused.length === 0) return null;
  const idx = Math.floor(Math.random() * unused.length);
  const word = unused[idx];
  state.usedWords.add(word);
  return word;
}

function resetAll() {
  state.players = {};
  state.adminId = null;
  state.categories = Object.keys(WORDS_BY_CATEGORY);
  state.usedWords = new Set();
  state.scores = { team1: 0, team2: 0 };
  state.round = {
    active: false,
    category: null,
    teamTurn: null,
    chosenPlayerId: null,
    endTime: null,
    currentWord: null,
    wordsLog: []
  };
  state.rotationIndex = { team1: 0, team2: 0 };
}

// If admin disconnects -> resetAll and notify everyone to go to screen 1
function handleAdminDisconnect() {
  resetAll();
  io.emit('forceReset');
  io.emit('state', publicState());
}

// Timer interval holder
let timerInterval = null;

function startServerTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.round.active) return;
    const now = Date.now();
    const timeLeftMs = Math.max(0, state.round.endTime - now);
    io.emit('time', { timeLeftMs });
    if (timeLeftMs === 0) {
      // end round
      endRound();
    }
  }, 250);
}

function endRound() {
  if (!state.round.active) return;
  state.round.active = false;
  // emit final round details
  io.emit('roundEnded', {
    wordsLog: state.round.wordsLog.slice()
  });
  // stop server timer? timerInterval continues but checks active flag
  // Do not clear chosen player: wait for admin to advance
  io.emit('state', publicState());
}

io.on('connection', (socket) => {
  console.log('conn:', socket.id);

  socket.on('join', (payload) => {
    // payload: {name}
    const rawName = (payload.name || '').toString().trim();
    const isAdmin = rawName.includes('9999');
    const displayName = rawName.replace(/9999/g, '').trim() || 'Jogador';
    // store
    state.players[socket.id] = {
      id: socket.id,
      name: rawName,
      displayName,
      isAdmin,
      team: 'lobby'
    };
    if (isAdmin) {
      // If there was an admin already, keep first one. But spec implies admin is single; here we'll set this as admin.
      state.adminId = socket.id;
      // when admin connects, we don't reset; only when admin disconnects we reset.
    }
    // send state
    socket.emit('joined', { id: socket.id, isAdmin });
    io.emit('state', publicState());
  });

  socket.on('setTeam', (data) => {
    // admin action to move a player: {playerId, team}
    if (socket.id !== state.adminId) return;
    const p = state.players[data.playerId];
    if (!p) return;
    if (!['lobby', 'team1', 'team2'].includes(data.team)) return;
    p.team = data.team;
    io.emit('state', publicState());
  });

  socket.on('startCategories', () => {
    if (socket.id !== state.adminId) return;
    // admin moves from lobby->categories screen — clients already show categories list from state
    io.emit('goCategories');
  });

  socket.on('selectCategory', (data) => {
    // admin picks a category to play: {category}
    if (socket.id !== state.adminId) return;
    const category = data.category;
    if (!state.categories.includes(category)) return;
    // remove category from available
    state.categories = state.categories.filter(c => c !== category);
    // prepare round: team1 plays first in each pair (per spec)
    // set teamTurn to 'team1' first
    state.round = {
      active: false,
      category,
      teamTurn: 'team1',
      chosenPlayerId: null,
      endTime: null,
      currentWord: null,
      wordsLog: []
    };
    // select chosen player for team1 based on rotation
    const team1Players = Object.values(state.players).filter(p => p.team === 'team1');
    const team2Players = Object.values(state.players).filter(p => p.team === 'team2');

    // fail-safe: if a team has no players, keep chosenPlayerId null
    if (team1Players.length > 0) {
      const idx = state.rotationIndex.team1 % team1Players.length;
      state.round.chosenPlayerId = team1Players[idx].id;
      // increment rotation index for that team for next time
      state.rotationIndex.team1 = (state.rotationIndex.team1 + 1) % Math.max(1, team1Players.length);
    } else {
      state.round.chosenPlayerId = null;
    }
    // finalize: emit prepareTurn
    io.emit('prepareTurn', {
      category: state.round.category,
      teamTurn: state.round.teamTurn,
      chosenPlayerId: state.round.chosenPlayerId,
      chosenPlayerName: state.round.chosenPlayerId ? state.players[state.round.chosenPlayerId].displayName : null
    });
    io.emit('state', publicState());
  });

  socket.on('playerStartTurn', () => {
    // This is the chosen player's click to start the 75s
    const sid = socket.id;
    if (sid !== state.round.chosenPlayerId) return; // only chosen player can start
    if (!state.round.category) return;
    if (state.round.active) return;
    const durationMs = 75 * 1000;
    state.round.active = true;
    state.round.endTime = Date.now() + durationMs;
    // pick first word
    const word = pickWord(state.round.category);
    state.round.currentWord = word;
    // emit startRound to all; others will see just timer
    io.emit('startRound', {
      category: state.round.category,
      teamTurn: state.round.teamTurn,
      chosenPlayerId: state.round.chosenPlayerId,
      endTime: state.round.endTime,
      currentWord: state.round.currentWord
    });
    io.emit('state', publicState());
    startServerTimer();
  });

  socket.on('correct', () => {
    const sid = socket.id;
    if (!state.round.active) return;
    if (sid !== state.round.chosenPlayerId) return; // only chosen player
    const team = state.round.teamTurn;
    // increment score
    state.scores[team] = (state.scores[team] || 0) + 1;
    // log word correct
    if (state.round.currentWord) {
      state.round.wordsLog.push({ word: state.round.currentWord, status: 'correct' });
    }
    // pick another word
    const newWord = pickWord(state.round.category);
    state.round.currentWord = newWord;
    // broadcast update: scores + new word
    io.emit('correctAck', {
      newWord: state.round.currentWord,
      scores: state.scores,
      wordsLog: state.round.wordsLog.slice()
    });
    io.emit('state', publicState());
  });

  // skip handling: hide UI for 3s but timer continues
  socket.on('skip', () => {
    const sid = socket.id;
    if (!state.round.active) return;
    if (sid !== state.round.chosenPlayerId) return;
    if (!state.round.currentWord) return;
    // record skipped
    state.round.wordsLog.push({ word: state.round.currentWord, status: 'skipped' });
    // emit skip start
    io.emit('skipAck', { until: Date.now() + 3000, wordsLog: state.round.wordsLog.slice() });
    // schedule new word after 3s
    setTimeout(() => {
      if (!state.round.active) return;
      const newWord = pickWord(state.round.category);
      state.round.currentWord = newWord;
      io.emit('newWord', {
        newWord: state.round.currentWord,
        wordsLog: state.round.wordsLog.slice()
      });
      io.emit('state', publicState());
    }, 3000);
    io.emit('state', publicState());
  });

  socket.on('adminAdvance', () => {
    // admin clicks advance after a team's 75s ended or after screen 6
    if (socket.id !== state.adminId) return;
    // if current team was team1 and team2 exists, then set up team2
    if (!state.round.category) return;
    const current = state.round.teamTurn;
    if (current === 'team1') {
      // prepare team2 turn similarly
      state.round.teamTurn = 'team2';
      // pick chosen player from team2 list by rotation
      const team2Players = Object.values(state.players).filter(p => p.team === 'team2');
      if (team2Players.length > 0) {
        const idx = state.rotationIndex.team2 % team2Players.length;
        state.round.chosenPlayerId = team2Players[idx].id;
        state.rotationIndex.team2 = (state.rotationIndex.team2 + 1) % Math.max(1, team2Players.length);
      } else {
        state.round.chosenPlayerId = null;
      }
      state.round.active = false;
      state.round.endTime = null;
      state.round.currentWord = null;
      state.round.wordsLog = [];
      io.emit('prepareTurn', {
        category: state.round.category,
        teamTurn: state.round.teamTurn,
        chosenPlayerId: state.round.chosenPlayerId,
        chosenPlayerName: state.round.chosenPlayerId ? state.players[state.round.chosenPlayerId].displayName : null
      });
      io.emit('state', publicState());
    } else if (current === 'team2') {
      // finished both teams -> return everyone to categories screen and remove category already removed
      // reset round
      state.round = {
        active: false,
        category: null,
        teamTurn: null,
        chosenPlayerId: null,
        endTime: null,
        currentWord: null,
        wordsLog: []
      };
      io.emit('backToCategories');
      io.emit('state', publicState());
    } else {
      // nothing
    }
  });

  socket.on('disconnect', () => {
    console.log('disc:', socket.id);
    const wasAdmin = state.players[socket.id] && state.players[socket.id].isAdmin;
    delete state.players[socket.id];
    if (wasAdmin) {
      // admin left: force reset as requested
      handleAdminDisconnect();
    } else {
      io.emit('state', publicState());
    }
  });

  // initial state send
  socket.emit('state', publicState());
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
