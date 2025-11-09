// server.js
const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const WORDS_FILE = path.join(__dirname, 'public', 'words.json');
let initialWords = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));
function cloneWords(w){ return JSON.parse(JSON.stringify(w)); }
let game = {
  started: false,
  startTime: null,
  teams: { a: 'Equipe A', b: 'Equipe B' },
  scores: { a: 0, b: 0 },
  words: cloneWords(initialWords),
  gameTimer: null
};
const rounds = new Map();
function resetGame(){
  if(game.gameTimer){ clearTimeout(game.gameTimer); game.gameTimer = null; }
  for(let r of rounds.values()){
    if(r.timer) clearTimeout(r.timer);
  }
  rounds.clear();
  game.started = false;
  game.startTime = null;
  game.teams = { a: 'Equipe A', b: 'Equipe B' };
  game.scores = { a: 0, b: 0 };
  game.words = cloneWords(initialWords);
  io.emit('gameReset');
  io.emit('scoreUpdate', game.scores);
  io.emit('state', { started: game.started, teams: game.teams, scores: game.scores, remaining: 0 });
}
function scheduleAutoReset(){
  if(game.gameTimer) clearTimeout(game.gameTimer);
  const ms = 7200 * 1000;
  const elapsed = Date.now() - game.startTime;
  const remaining = Math.max(0, ms - elapsed);
  game.gameTimer = setTimeout(() => resetGame(), remaining);
}
io.on('connection', socket=>{
  socket.emit('init', { started: game.started, teams: game.teams, scores: game.scores, categories: Object.keys(initialWords), remaining: game.startTime ? Math.max(0, 7200*1000 - (Date.now()-game.startTime)) : 0 });
  socket.on('startGame', ({team1, team2, password})=>{
    if(password !== '12345678'){ socket.emit('startFailed'); return; }
    if(game.started){ socket.emit('startFailed'); return; }
    game.started = true;
    game.startTime = Date.now();
    game.teams = { a: team1 || 'Equipe A', b: team2 || 'Equipe B' };
    game.scores = { a: 0, b: 0 };
    game.words = cloneWords(initialWords);
    scheduleAutoReset();
    io.emit('gameStarted', { teams: game.teams, scores: game.scores, remaining: 7200*1000 });
  });
  socket.on('requestState', ()=> {
    socket.emit('state', { started: game.started, teams: game.teams, scores: game.scores, remaining: game.startTime ? Math.max(0, 7200*1000 - (Date.now()-game.startTime)) : 0 });
  });
  socket.on('resetGame', ()=> {
    resetGame();
  });
  socket.on('startRound', ({ category, team })=>{
    if(!game.started){ socket.emit('roundDenied'); return; }
    if(!game.words[category] || game.words[category].length === 0){ socket.emit('noWords'); return; }
    const idx = Math.floor(Math.random() * game.words[category].length);
    const word = game.words[category].splice(idx, 1)[0];
    if(!word){ socket.emit('noWords'); return; }
    if(rounds.has(socket.id)){
      const r = rounds.get(socket.id);
      if(r.timer) clearTimeout(r.timer);
      rounds.delete(socket.id);
    }
    const duration = 75;
    const endTime = Date.now() + duration*1000;
    const timer = setTimeout(()=> {
      socket.emit('roundEnded');
      rounds.delete(socket.id);
    }, duration*1000);
    rounds.set(socket.id, { timer, category, team, endTime });
    socket.emit('roundStarted', { word, duration });
    io.emit('scoreUpdate', game.scores);
  });
  socket.on('roundCorrect', ({ team })=>{
    const r = rounds.get(socket.id);
    if(!r) return;
    if(team === 'a' || team === 'b') game.scores[team] = (game.scores[team] || 0) + 1;
    io.emit('scoreUpdate', game.scores);
    const category = r.category;
    if(!game.words[category] || game.words[category].length === 0){
      socket.emit('noWords');
      return;
    }
    const idx = Math.floor(Math.random() * game.words[category].length);
    const word = game.words[category].splice(idx, 1)[0];
    if(!word){ socket.emit('noWords'); return; }
    socket.emit('newWord', { word });
  });
  socket.on('roundSkip', ()=>{
    const r = rounds.get(socket.id);
    if(!r) return;
    const category = r.category;
    setTimeout(()=>{
      if(!game.words[category] || game.words[category].length === 0){
        socket.emit('noWords');
        return;
      }
      const idx = Math.floor(Math.random() * game.words[category].length);
      const word = game.words[category].splice(idx, 1)[0];
      if(!word){ socket.emit('noWords'); return; }
      socket.emit('newWord', { word });
    }, 3000);
  });
  socket.on('disconnect', ()=>{
    const r = rounds.get(socket.id);
    if(r){
      if(r.timer) clearTimeout(r.timer);
      rounds.delete(socket.id);
    }
  });
});
app.use(express.static(path.join(__dirname, 'public')));
server.listen(PORT);
