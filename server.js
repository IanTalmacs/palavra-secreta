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

const WORDS = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'words.json')));

// Server state (in-memory, temporary)
let state = {
  players: {}, // socketId -> {id, name, displayName, team, isAdmin}
  teams: {1: 0, 2: 0},
  usedWords: new Set(),
  current: {
    category: null,
    chooserId: null,      // admin socket id who chose (for reference)
    chosenPlayerId: null, // socket id of player who will perform
    roundActive: false,
    guessed: [], // words guessed this round
    skipped: []
  },
  timer: null
};

function resetState(reason = 'reset') {
  // clear timer
  if (state.timer) {
    clearInterval(state.timer.interval);
    state.timer = null;
  }
  state.players = {};
  state.teams = {1: 0, 2: 0};
  state.usedWords = new Set();
  state.current = {
    category: null,
    chooserId: null,
    chosenPlayerId: null,
    roundActive: false,
    guessed: [],
    skipped: []
  };
  // inform all connected sockets to go to screen1
  io.emit('serverReset', {reason});
}

function getPublicPlayers() {
  return Object.entries(state.players).map(([id, p]) => ({
    id,
    name: p.displayName,
    team: p.team,
    isAdmin: p.isAdmin
  }));
}

function pickRandomWord(category) {
  const arr = WORDS[category] || [];
  const available = arr.filter(w => !state.usedWords.has(w));
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  const word = available[idx];
  state.usedWords.add(word);
  return word;
}

io.on('connection', socket => {
  console.log('connect', socket.id);

  // send initial state (mostly empty) so client can show screen1
  socket.emit('init', {
    players: getPublicPlayers(),
    teams: state.teams,
    category: state.current.category
  });

  socket.on('join', ({name, team}, cb) => {
    // name: raw from user, team: 1 or 2
    const isAdmin = typeof name === 'string' && name.includes('995');
    const displayName = (typeof name === 'string') ? name.replace(/995/g, '') : name;

    state.players[socket.id] = {
      id: socket.id,
      name,
      displayName: displayName || 'Player',
      team: team === 2 ? 2 : 1,
      isAdmin: !!isAdmin
    };

    // If admin present set chooserId
    if (isAdmin) state.current.chooserId = socket.id;

    io.emit('playersUpdate', {players: getPublicPlayers(), teams: state.teams});
    cb && cb({ok: true, isAdmin: !!isAdmin});
  });

  // Admin chooses category
  socket.on('chooseCategory', ({category}, cb) => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) {
      return cb && cb({ok: false, error: 'Somente admin pode escolher categoria'});
    }
    if (!WORDS[category]) {
      return cb && cb({ok: false, error: 'Categoria inválida'});
    }
    state.current.category = category;
    state.current.chosenPlayerId = null;
    state.current.roundActive = false;
    state.current.guessed = [];
    state.current.skipped = [];
    io.emit('categoryChosen', {category, players: getPublicPlayers(), teams: state.teams});
    cb && cb({ok: true});
  });

  // Admin selects which player will play
  socket.on('selectPlayer', ({playerId}, cb) => {
    const p = state.players[socket.id];
    if (!p || !p.isAdmin) {
      return cb && cb({ok: false, error: 'Somente admin pode selecionar player'});
    }
    if (!state.players[playerId]) {
      return cb && cb({ok: false, error: 'Player não encontrado'});
    }
    state.current.chosenPlayerId = playerId;
    // notify all so the selected player can see the Start button
    io.emit('playerSelected', {playerId});
    cb && cb({ok: true});
  });

  // Player (selected) presses Start
  socket.on('startRound', (cb) => {
    const p = state.players[socket.id];
    if (!p) return cb && cb({ok:false, error:'Usuário não encontrado'});
    // must be the chosen player
    if (socket.id !== state.current.chosenPlayerId) {
      return cb && cb({ok:false, error:'Somente o player escolhido pode iniciar'});
    }
    if (!state.current.category) return cb && cb({ok:false, error:'Nenhuma categoria escolhida'});
    if (state.current.roundActive) return cb && cb({ok:false, error:'Round já ativo'});

    // start round
    state.current.roundActive = true;
    state.current.guessed = [];
    state.current.skipped = [];

    const word = pickRandomWord(state.current.category);
    const duration = 75; // seconds
    const startTime = Date.now();
    let t = duration;

    // Broadcast start: chosen gets word; others get only timer view
    io.to(socket.id).emit('roundStartedChosen', {word, time: t});
    socket.broadcast.emit('roundStartedOther', {time: t});

    // Start server-side timer
    state.timer = {
      interval: setInterval(() => {
        t--;
        if (t >= 0) {
          io.emit('timer', {time: t});
        }
        if (t <= 0) {
          // stop
          clearInterval(state.timer.interval);
          state.timer = null;
          state.current.roundActive = false;
          // send round end with guessed and skipped (marked)
          io.emit('roundEnd', {
            guessed: state.current.guessed,
            skipped: state.current.skipped,
            teams: state.teams
          });
          // reset chosen player
          state.current.chosenPlayerId = null;
        }
      }, 1000)
    };

    cb && cb({ok:true});
  });

  // Chosen player clicked 'acertou' (correct)
  socket.on('correct', (cb) => {
    if (socket.id !== state.current.chosenPlayerId) {
      return cb && cb({ok:false, error:'Somente player escolhido pode marcar acerto'});
    }
    if (!state.current.roundActive) return cb && cb({ok:false, error:'Nenhum round ativo'});

    // award point to team of player
    const player = state.players[socket.id];
    if (!player) return cb && cb({ok:false, error:'Player não encontrado'});

    state.teams[player.team] = (state.teams[player.team] || 0) + 1;

    // last shown word is assumed to be the last added to guessed/skipped? We'll keep track:
    // We'll send the word back from client to avoid ambiguity
    // but client may not send it; instead we trust client to send word param.
    // To keep robust, accept optional {word}
    // For simplicity, expect client sends last word; if not, just record '??'
    // Here we require client to send the word.
    cb && cb({ok:true});
  });

  // To be robust: client should call 'correctWord' with the word text
  socket.on('correctWord', ({word}, cb) => {
    if (socket.id !== state.current.chosenPlayerId) {
      return cb && cb({ok:false, error:'Somente player escolhido pode marcar acerto'});
    }
    if (!state.current.roundActive) return cb && cb({ok:false, error:'Nenhum round ativo'});
    if (!word) return cb && cb({ok:false, error:'Palavra faltando'});

    state.current.guessed.push(word);
    // award point to team
    const player = state.players[socket.id];
    state.teams[player.team] = (state.teams[player.team] || 0) + 1;

    // pick next word
    const next = pickRandomWord(state.current.category);
    if (!next) {
      // no more words
      io.to(socket.id).emit('noMoreWords');
      io.emit('teamsUpdate', {teams: state.teams});
      return cb && cb({ok:true});
    } else {
      io.to(socket.id).emit('newWord', {word: next});
      io.emit('teamsUpdate', {teams: state.teams});
      return cb && cb({ok:true});
    }
  });

  // Player clicked 'pular' (skip)
  socket.on('skipWord', ({word}, cb) => {
    if (socket.id !== state.current.chosenPlayerId) {
      return cb && cb({ok:false, error:'Somente player escolhido pode pular'});
    }
    if (!state.current.roundActive) return cb && cb({ok:false, error:'Nenhum round ativo'});

    if (word) state.current.skipped.push(word);
    // show 'pulando...' for 3s then new word
    io.to(socket.id).emit('skipping', {word});
    setTimeout(() => {
      const next = pickRandomWord(state.current.category);
      if (!next) {
        io.to(socket.id).emit('noMoreWords');
      } else {
        io.to(socket.id).emit('newWord', {word: next});
      }
    }, 3000);

    cb && cb({ok:true});
  });

  // Generic request: get current state (for reconnect)
  socket.on('getState', (cb) => {
    cb && cb({
      players: getPublicPlayers(),
      teams: state.teams,
      category: state.current.category,
      chosenPlayerId: state.current.chosenPlayerId,
      roundActive: state.current.roundActive,
      guessed: state.current.guessed,
      skipped: state.current.skipped
    });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    // Check if disconnecting socket was admin
    const p = state.players[socket.id];
    const wasAdmin = p && p.isAdmin;
    // remove player
    delete state.players[socket.id];
    io.emit('playersUpdate', {players: getPublicPlayers(), teams: state.teams});

    if (wasAdmin) {
      // Requirement: if admin refreshes/updates page, all go back to screen 1 and words reset
      // So reset entire server state
      console.log('Admin disconnected -> resetting state');
      resetState('adminDisconnected');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
