const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const WORDS = JSON.parse(fs.readFileSync(__dirname + '/public/words.json', 'utf8'));
const CATEGORY_LIST = Object.keys(WORDS);

let state = {
  players: {}, // socketId -> {name, role, team}
  adminId: null,
  availableCategories: [...CATEGORY_LIST],
  usedWords: new Set(),
  scores: { team1: 0, team2: 0 },
  teamOrder: { team1: [], team2: [] },
  nextIndex: { team1: 0, team2: 0 },
  round: null // details of current mini-round
};

function broadcastState() {
  const players = Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,{name:p.name,role:p.role,team:p.team}]));
  io.emit('state', {
    players,
    adminId: state.adminId,
    availableCategories: state.availableCategories,
    scores: state.scores
  });
}

function rebuildTeamOrder() {
  state.teamOrder.team1 = Object.keys(state.players).filter(id => state.players[id].team === 'team1');
  state.teamOrder.team2 = Object.keys(state.players).filter(id => state.players[id].team === 'team2');
}

function pickNextPlayer(team) {
  const arr = state.teamOrder[team];
  if (!arr || arr.length === 0) return null;
  const idx = state.nextIndex[team] % arr.length;
  const playerId = arr[idx];
  state.nextIndex[team] = (state.nextIndex[team] + 1) % Math.max(arr.length,1);
  return playerId;
}

function getNextUnusedWordFromList(list) {
  while (list.length) {
    const w = list.shift();
    if (!state.usedWords.has(w)) {
      state.usedWords.add(w);
      return w;
    }
  }
  return null;
}

io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('join', name => {
    state.players[socket.id] = { name: name || 'Anon', role: 'visitor', team: 'lobby' };
    // if no admin yet, keep admin null until someone chooses admin
    broadcastState();
  });

  socket.on('chooseRole', ({ role, password }) => {
    const pl = state.players[socket.id];
    if (!pl) return;
    if (role === 'admin') {
      if (password === '12345678') {
        state.adminId = socket.id;
        pl.role = 'admin';
        console.log('admin set', socket.id);
      } else {
        socket.emit('adminDenied');
      }
    } else {
      pl.role = 'visitor';
    }
    broadcastState();
  });

  socket.on('assignTeam', ({ playerId, team }) => {
    if (socket.id !== state.adminId) return;
    if (!state.players[playerId]) return;
    state.players[playerId].team = team;
    rebuildTeamOrder();
    broadcastState();
  });

  socket.on('openCategories', () => {
    if (socket.id !== state.adminId) return;
    io.emit('showCategories', state.availableCategories);
  });

  socket.on('selectCategory', category => {
    if (socket.id !== state.adminId) return;
    if (!state.availableCategories.includes(category)) return;
    // remove the category from available
    state.availableCategories = state.availableCategories.filter(c=>c!==category);

    // prepare round data
    const list = [...(WORDS[category] || [])];
    // shuffle
    for (let i = list.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    state.round = {
      category,
      wordList: list,
      guessed: [],
      skipped: [],
      teamSequence: ['team1','team2'],
      currentTeamIndex: 0,
      currentPlayer: null,
      currentWord: null,
      timer: null,
      timeLeft: 0
    };

    rebuildTeamOrder();
    // pick first player from team1 to prepare
    const firstPlayer = pickNextPlayer('team1');
    state.round.currentTeam = 'team1';
    state.round.currentPlayer = firstPlayer;

    io.emit('categorySelected', { category, currentPlayer: firstPlayer, currentTeam: 'team1' });
  });

  socket.on('startTurn', () => {
    if (!state.round) return;
    if (socket.id !== state.round.currentPlayer) return;
    // start timer
    state.round.timeLeft = 75;
    function chooseWord() {
      const w = getNextUnusedWordFromList(state.round.wordList);
      state.round.currentWord = w;
      return w;
    }
    const firstWord = chooseWord();
    io.emit('turnStarted', { playerId: socket.id, team: state.round.currentTeam, word: firstWord });

    state.round.timer = setInterval(() => {
      state.round.timeLeft -= 1;
      io.emit('tick', { timeLeft: state.round.timeLeft });
      if (state.round.timeLeft <= 0) {
        clearInterval(state.round.timer);
        state.round.timer = null;
        io.emit('roundEnded', { guessed: state.round.guessed, skipped: state.round.skipped });
      }
    }, 1000);
  });

  socket.on('correct', () => {
    if (!state.round) return;
    if (socket.id !== state.round.currentPlayer) return;
    const word = state.round.currentWord;
    if (!word) return;
    state.round.guessed.push(word);
    // add score
    if (state.round.currentTeam === 'team1') state.scores.team1 += 1; else state.scores.team2 += 1;
    io.emit('scoreUpdate', state.scores);
    // choose next word immediately
    const next = getNextUnusedWordFromList(state.round.wordList);
    state.round.currentWord = next;
    if (next) io.emit('newWord', next); else io.emit('noMoreWords');
  });

  socket.on('skip', () => {
    if (!state.round) return;
    if (socket.id !== state.round.currentPlayer) return;
    const word = state.round.currentWord;
    if (!word) return;
    state.round.skipped.push(word);
    // hide buttons for 3 seconds and then emit new word
    io.emit('skipStart');
    const next = getNextUnusedWordFromList(state.round.wordList);
    state.round.currentWord = next;
    setTimeout(()=>{
      if (next) io.emit('newWord', next);
      else io.emit('noMoreWords');
    }, 3000);
  });

  socket.on('adminAdvance', () => {
    if (socket.id !== state.adminId) return;
    // Called after the verification screen (Tela7)
    if (!state.round) return;

    // If current team was team1, prepare team2, else finish category and go back to categories
    if (state.round.currentTeam === 'team1') {
      // prepare team2
      const nextPlayer = pickNextPlayer('team2');
      state.round.currentTeam = 'team2';
      state.round.currentPlayer = nextPlayer;
      state.round.guessed = [];
      state.round.skipped = [];
      state.round.currentWord = null;
      io.emit('prepareTurn', { currentPlayer: nextPlayer, currentTeam: 'team2' });
    } else {
      // both teams done -> return to categories
      state.round = null;
      io.emit('backToCategories', state.availableCategories);
    }
  });

  socket.on('finalizeRequest', () => {
    if (socket.id !== state.adminId) return;
    io.emit('confirmFinalize');
  });

  socket.on('confirmFinalize', (answer) => {
    if (socket.id !== state.adminId) return;
    if (answer === true) {
      io.emit('gameOver', { scores: state.scores });
      // reset everything
      state.availableCategories = [...CATEGORY_LIST];
      state.usedWords.clear();
      state.scores = { team1: 0, team2: 0 };
      state.round = null;
      state.nextIndex = { team1: 0, team2: 0 };
      broadcastState();
    } else {
      io.emit('backToCategories', state.availableCategories);
    }
  });

  socket.on('showLobby', () => {
    // broadcast current lobby players
    const lobby = Object.entries(state.players).filter(([id,p])=>p.team==='lobby').map(([id,p])=>({id,name:p.name}));
    io.emit('showLobbyClients', lobby);
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const wasAdmin = state.adminId === socket.id;
    delete state.players[socket.id];
    rebuildTeamOrder();
    // if admin disconnected, reset entire game (as requested)
    if (wasAdmin) {
      state.adminId = null;
      state.availableCategories = [...CATEGORY_LIST];
      state.usedWords.clear();
      state.scores = { team1: 0, team2: 0 };
      state.round = null;
      state.nextIndex = { team1: 0, team2: 0 };
      io.emit('adminGone');
    }
    broadcastState();
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('listening on', PORT));