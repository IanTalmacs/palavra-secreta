const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const fs = require('fs');

const WORDS = JSON.parse(fs.readFileSync(__dirname + '/public/words.json'));

let state = createInitialState();

function createInitialState(){
  return {
    screen: 1,
    players: {},
    order: [],
    adminId: null,
    teams: { lobby: [], team1: [], team2: [] },
    scores: { team1:0, team2:0 },
    categories: ["animais","tv-cinema","objetos","lugares","pessoas","esportes-jogos","profissoes","alimentos","personagens","biblico"],
    selectedCategory: null,
    wordsPool: JSON.parse(JSON.stringify(WORDS)),
    usedWords: [],
    round: null,
  }
}

function resetGame(){
  state = createInitialState();
  io.emit('state', sanitizeState());
}

function sanitizeState(){
  const players = {};
  for(const [id, p] of Object.entries(state.players)){
    players[id] = {
      name: p.name,
      displayName: p.displayName,
      team: p.team,
      isAdmin: p.isAdmin
    };
  }
  return {
    screen: state.screen,
    players,
    teams: state.teams,
    scores: state.scores,
    categories: state.categories,
    selectedCategory: state.selectedCategory,
    round: state.round ? {
      playerId: state.round.playerId,
      team: state.round.team,
      endTime: state.round.endTime,
      skipping: state.round.skipping
    } : null,
    usedWords: state.usedWords
  };
}

io.on('connection', socket => {
  socket.on('join', () => {
    socket.emit('state', sanitizeState());
  });

  socket.on('confirmName', name => {
    if(!name) return;
    const isAdmin = name.includes('999');
    const displayName = isAdmin ? name.replace(/999/g, '') : name;
    state.players[socket.id] = { name, displayName, team: 'lobby', isAdmin };
    state.teams.lobby.push(socket.id);
    state.order.push(socket.id);
    if(isAdmin){
      state.adminId = socket.id;
    }
    io.emit('state', sanitizeState());
  });

  socket.on('dragUpdate', ({playerId, toTeam}) => {
    if(!(state.players[socket.id] && state.players[socket.id].isAdmin)) return;
    if(!state.players[playerId]) return;
    if(!['lobby','team1','team2'].includes(toTeam)) return;
    // remove from any team it may be in
    for(const t of ['lobby','team1','team2']){
      state.teams[t] = state.teams[t].filter(id => id !== playerId);
    }
    state.teams[toTeam].push(playerId);
    state.players[playerId].team = toTeam;
    io.emit('state', sanitizeState());
  });

  socket.on('advanceScreen', () => {
    if(!(state.players[socket.id] && state.players[socket.id].isAdmin)) return;
    if(state.screen === 1) state.screen = 2;
    else if(state.screen === 2) state.screen = 3;
    else if(state.screen === 3) state.screen = 4;
    else if(state.screen === 4) state.screen = 5;
    else state.screen = 1;
    io.emit('state', sanitizeState());
  });

  socket.on('selectCategory', cat => {
    if(state.screen !== 2) return;
    if(!(state.players[socket.id] && state.players[socket.id].isAdmin)) return;
    if(!state.categories.includes(cat)) return;
    state.selectedCategory = cat;
    state.screen = 3;
    io.emit('state', sanitizeState());
  });

  socket.on('selectPlayerToPlay', playerId => {
    if(state.screen !== 3) return;
    if(!(state.players[socket.id] && state.players[socket.id].isAdmin)) return;
    if(!state.players[playerId]) return;
    io.emit('playerToPlay', playerId);
  });

  socket.on('startTurn', () => {
    const player = state.players[socket.id];
    if(!player) return;
    if(state.round && state.round.playerId) return;
    const team = player.team === 'team1' ? 'team1' : 'team2';
    const now = Date.now();
    const endTime = now + 75000;
    const word = drawWord(state.selectedCategory);
    state.round = {
      playerId: socket.id,
      team,
      endTime,
      currentWord: word,
      skipping: false,
      answered: []
    };
    state.screen = 4;
    io.emit('state', sanitizeState());
    io.emit('startTurn', { playerId: socket.id, endTime, word });
    startRoundTimer();
  });

  socket.on('correct', () => {
    if(!state.round) return;
    if(socket.id !== state.round.playerId) return;
    if(!state.round.currentWord) return;
    state.scores[state.round.team] += 1;
    state.round.answered.push({ word: state.round.currentWord, result: 'correct' });
    const next = drawWord(state.selectedCategory);
    state.round.currentWord = next;
    io.emit('roundUpdate', { currentWord: state.round.currentWord, scores: state.scores, answered: state.round.answered });
  });

  socket.on('skip', () => {
    if(!state.round) return;
    if(socket.id !== state.round.playerId) return;
    if(state.round.skipping) return;
    state.round.answered.push({ word: state.round.currentWord, result: 'skipped' });
    state.round.currentWord = null;
    state.round.skipping = true;
    io.emit('roundUpdate', { currentWord: null, skipping: true, answered: state.round.answered });
    setTimeout(()=>{
      state.round.skipping = false;
      const next = drawWord(state.selectedCategory);
      state.round.currentWord = next;
      io.emit('roundUpdate', { currentWord: next, skipping: false, answered: state.round.answered });
    }, 3000);
  });

  socket.on('requestState', () => {
    socket.emit('state', sanitizeState());
  });

  socket.on('disconnect', (reason) => {
    const wasAdmin = state.adminId === socket.id;
    if(state.players[socket.id]){
      const team = state.players[socket.id].team;
      state.teams[team] = state.teams[team].filter(id => id !== socket.id);
      delete state.players[socket.id];
      state.order = state.order.filter(id => id !== socket.id);
    }
    if(wasAdmin){
      resetGame();
      return;
    }
    io.emit('state', sanitizeState());
  });
});

function drawWord(category){
  const pool = state.wordsPool[category] || [];
  while(pool.length && state.usedWords.length <= Object.values(WORDS).flat().length){
    const idx = Math.floor(Math.random() * pool.length);
    const w = pool.splice(idx,1)[0];
    if(!state.usedWords.includes(w)){
      state.usedWords.push(w);
      return w;
    }
  }
  return null;
}

let roundInterval = null;
function startRoundTimer(){
  if(roundInterval) clearInterval(roundInterval);
  roundInterval = setInterval(()=>{
    if(!state.round) { clearInterval(roundInterval); roundInterval = null; return; }
    const now = Date.now();
    const remaining = state.round.endTime - now;
    if(remaining <= 0){
      clearInterval(roundInterval); roundInterval = null;
      state.screen = 5;
      io.emit('timeUp', { answered: state.round.answered, scores: state.scores });
      state.round = null;
      io.emit('state', sanitizeState());
    } else {
      io.emit('tick', { remaining });
    }
  }, 250);
}

app.use(express.static(__dirname + '/public'));

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=> console.log('listening on', PORT));
