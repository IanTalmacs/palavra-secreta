const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORDS_FILE = path.join(__dirname, 'public', 'words.json');

function loadWords() {
  const raw = fs.readFileSync(WORDS_FILE, 'utf8');
  const obj = JSON.parse(raw);
  return obj;
}

let initialWords = loadWords();

function makeInitialState() {
  return {
    players: {}, // socketId -> { id, name, displayName, isAdmin, team: 'lobby'|'team1'|'team2' }
    teams: { team1: [], team2: [] }, // arrays of socketIds in order
    lobby: [],
    categories: Object.keys(initialWords),
    wordsByCategory: JSON.parse(JSON.stringify(initialWords)), // deep copy
    usedWords: {}, // category -> Set
    scores: { team1: 0, team2: 0 },
    rotationIndex: { team1: 0, team2: 0 }, // next player index for each team (rotation)
    current: {
      category: null,
      teamTurn: null, // 'team1' or 'team2'
      playerId: null,
      wordsRound: [], // [{word, status:'ok'|'skipped'}]
      timer: null,
      remaining: 0,
      interval: null,
      skipping: false
    }
  };
}

let state = makeInitialState();

function resetGame() {
  state = makeInitialState();
  // reload words from file (in case you edited)
  initialWords = loadWords();
  state.wordsByCategory = JSON.parse(JSON.stringify(initialWords));
  state.categories = Object.keys(initialWords);
}

function publicPlayersArray() {
  return Object.values(state.players).map(p => ({
    id: p.id,
    name: p.displayName,
    team: p.team,
    isAdmin: p.isAdmin
  }));
}

function broadcastLobby() {
  io.emit('lobbyState', {
    players: publicPlayersArray(),
    teams: {
      team1: state.teams.team1.map(id => state.players[id] ? { id, name: state.players[id].displayName } : null).filter(Boolean),
      team2: state.teams.team2.map(id => state.players[id] ? { id, name: state.players[id].displayName } : null).filter(Boolean),
      lobby: state.lobby.map(id => state.players[id] ? { id, name: state.players[id].displayName } : null).filter(Boolean)
    },
    categories: state.categories,
    scores: state.scores
  });
}

function pickWord(category) {
  if (!state.wordsByCategory[category]) return null;
  const pool = state.wordsByCategory[category];
  if (!Array.isArray(pool) || pool.length === 0) return null;
  // choose random
  const idx = Math.floor(Math.random() * pool.length);
  const w = pool.splice(idx, 1)[0]; // remove from pool -> ensures no repetition until reset
  // mark used
  if (!state.usedWords[category]) state.usedWords[category] = new Set();
  state.usedWords[category].add(w);
  return w;
}

function prepareNextForTeam(team) {
  const members = state.teams[team];
  if (!members || members.length === 0) {
    // no players - skip
    return null;
  }
  const idx = state.rotationIndex[team] % members.length;
  const playerId = members[idx];
  state.current.playerId = playerId;
  state.current.teamTurn = team;
  state.current.wordsRound = [];
  state.current.skipping = false;
  // send prepare to all
  const name = state.players[playerId].displayName;
  io.emit('preparePlayer', { playerId, name, team });
  return playerId;
}

function startTimer(seconds) {
  clearInterval(state.current.interval);
  state.current.remaining = seconds;
  io.emit('tick', { remaining: state.current.remaining });
  state.current.interval = setInterval(() => {
    state.current.remaining -= 1;
    io.emit('tick', { remaining: state.current.remaining });
    if (state.current.remaining <= 5) {
      io.emit('hideSkip');
    }
    if (state.current.remaining <= 0) {
      clearInterval(state.current.interval);
      state.current.interval = null;
      // round end
      io.emit('roundEnd', { words: state.current.wordsRound.slice(), team: state.current.teamTurn, scores: state.scores });
    }
  }, 1000);
}

function stopTimer() {
  if (state.current.interval) {
    clearInterval(state.current.interval);
    state.current.interval = null;
  }
}

io.on('connection', socket => {
  console.log('conn:', socket.id);

  socket.on('join', ({ rawName }) => {
    const isAdmin = rawName.includes('9999');
    const displayName = rawName.replace(/9999/g, '').trim() || 'Player';
    state.players[socket.id] = {
      id: socket.id,
      name: rawName,
      displayName,
      isAdmin,
      team: 'lobby'
    };
    state.lobby.push(socket.id);

    // If this is an admin connecting -> reset game state as requested
    if (isAdmin) {
      console.log('Admin connected -> resetting game state as required by spec.');
      resetGame();
      // but preserve this admin as a player (replace players map) -> we'll re-add below
      // remove all players references in state (so everyone goes to screen1)
      // To be safe, keep state.players only to include currently connected sockets (we'll keep this socket)
      // already set above, broadcast reset
      io.emit('reset');
    }

    // send current state to everyone
    broadcastLobby();
  });

  socket.on('movePlayer', ({ playerId, dest }) => {
    // only admin can move
    const actor = state.players[socket.id];
    if (!actor || !actor.isAdmin) return;
    if (!state.players[playerId]) return;

    // remove from all lists
    state.teams.team1 = state.teams.team1.filter(id => id !== playerId);
    state.teams.team2 = state.teams.team2.filter(id => id !== playerId);
    state.lobby = state.lobby.filter(id => id !== playerId);

    if (dest === 'team1') {
      state.teams.team1.push(playerId);
      state.players[playerId].team = 'team1';
    } else if (dest === 'team2') {
      state.teams.team2.push(playerId);
      state.players[playerId].team = 'team2';
    } else {
      state.lobby.push(playerId);
      state.players[playerId].team = 'lobby';
    }
    broadcastLobby();
  });

  socket.on('removePlayer', ({ playerId }) => {
    const actor = state.players[socket.id];
    if (!actor || !actor.isAdmin) return;
    if (!state.players[playerId]) return;
    delete state.players[playerId];
    state.teams.team1 = state.teams.team1.filter(id => id !== playerId);
    state.teams.team2 = state.teams.team2.filter(id => id !== playerId);
    state.lobby = state.lobby.filter(id => id !== playerId);
    // inform all
    broadcastLobby();
  });

  socket.on('selectCategory', ({ category }) => {
    const actor = state.players[socket.id];
    if (!actor || !actor.isAdmin) return;
    if (!state.categories.includes(category)) return;
    // remove from categories list now (so others cannot pick)
    state.categories = state.categories.filter(c => c !== category);
    state.current.category = category;
    state.scores = { team1: 0, team2: 0 };
    io.emit('categorySelected', { category, categories: state.categories });

    // start with team1
    state.current.teamTurn = 'team1';
    const p = prepareNextForTeam('team1');
    broadcastLobby();
  });

  socket.on('startTurn', () => {
    // only current player may start
    if (socket.id !== state.current.playerId) return;
    if (!state.current.category) return;
    // pick a word and start timer
    const word = pickWord(state.current.category) || '---';
    io.emit('turnStarted', { playerId: socket.id, word, team: state.current.teamTurn });
    startTimer(75);
  });

  socket.on('correct', () => {
    // only current player can press
    if (socket.id !== state.current.playerId) return;
    // increment score
    if (state.current.teamTurn === 'team1') state.scores.team1 += 1;
    else state.scores.team2 += 1;
    // record word as correct (we expect server knows last picked word)
    // We'll assume clients send last word; safer: require client to send word - do that:
  });

  // better to accept word param for correct / skip:
  socket.on('gotIt', ({ word }) => {
    if (socket.id !== state.current.playerId) return;
    if (!word) return;
    state.current.wordsRound.push({ word, status: 'ok' });
    // add point
    if (state.current.teamTurn === 'team1') state.scores.team1 += 1;
    else state.scores.team2 += 1;
    // send next word
    const next = pickWord(state.current.category) || null;
    io.emit('wordUpdate', { word: next, scores: state.scores });
  });

  socket.on('skipWord', ({ word }) => {
    if (socket.id !== state.current.playerId) return;
    if (!word) return;
    state.current.wordsRound.push({ word, status: 'skipped' });
    // notify only the current player to show 'pulando...' and hide word/buttons
    io.to(socket.id).emit('skipping');
    // after 3 seconds pick next word and send to current player
    setTimeout(() => {
      const next = pickWord(state.current.category) || null;
      io.to(socket.id).emit('wordUpdate', { word: next, scores: state.scores });
    }, 3000);
  });

  // Admin advances from screen 6 to next team or back to categories.
  socket.on('adminAdvance', () => {
    const actor = state.players[socket.id];
    if (!actor || !actor.isAdmin) return;
    // if current team was team1 -> move to team2's prepare
    if (state.current.teamTurn === 'team1') {
      stopTimer();
      state.current.teamTurn = 'team2';
      const p = prepareNextForTeam('team2');
      broadcastLobby();
      return;
    }
    if (state.current.teamTurn === 'team2') {
      // both done. finalize round, rotate players and send categories screen
      stopTimer();
      // advance rotation index (so next category picks next player)
      if (state.teams.team1.length > 0) state.rotationIndex.team1 = (state.rotationIndex.team1 + 1) % Math.max(1, state.teams.team1.length);
      if (state.teams.team2.length > 0) state.rotationIndex.team2 = (state.rotationIndex.team2 + 1) % Math.max(1, state.teams.team2.length);
      const finishedCategory = state.current.category;
      state.current.category = null;
      state.current.playerId = null;
      state.current.teamTurn = null;
      state.current.wordsRound = [];
      // send categories list
      io.emit('categories', { categories: state.categories });
      broadcastLobby();
      return;
    }
    // fallback
    broadcastLobby();
  });

  socket.on('requestLobby', () => {
    broadcastLobby();
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    // remove player
    const p = state.players[socket.id];
    if (p && p.isAdmin) {
      // if admin disconnected: as requested earlier, we should reset everything (or when admin reconnect)
      // The spec required: "If the admin updates the page, all players must return to screen 1 and the categories and words must be reset."
      // Disconnect could be refresh. We'll reset state on admin disconnect as well to guarantee behavior.
      console.log('Admin disconnected -> resetting state.');
      resetGame();
      io.emit('reset');
      // remove this socket's player record
      delete state.players[socket.id];
      state.teams.team1 = state.teams.team1.filter(id => id !== socket.id);
      state.teams.team2 = state.teams.team2.filter(id => id !== socket.id);
      state.lobby = state.lobby.filter(id => id !== socket.id);
      broadcastLobby();
      return;
    }

    // normal player disconnect: remove from lists
    delete state.players[socket.id];
    state.teams.team1 = state.teams.team1.filter(id => id !== socket.id);
    state.teams.team2 = state.teams.team2.filter(id => id !== socket.id);
    state.lobby = state.lobby.filter(id => id !== socket.id);
    broadcastLobby();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
