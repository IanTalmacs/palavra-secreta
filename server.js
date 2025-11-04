// server.js
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const WORDS_PATH = path.join(__dirname, 'public', 'words.json');
let wordsData = {};
function loadWords(){
  try{
    const raw = fs.readFileSync(WORDS_PATH, 'utf8');
    wordsData = JSON.parse(raw);
  }catch(e){
    wordsData = {};
  }
}
loadWords();
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;
let players = {};
let teamNames = ['Equipe A','Equipe B'];
let scores = { 'Equipe A':0, 'Equipe B':0 };
let usedWords = new Set();
let acertadas = [];
let puladas = [];
let gameStarted = false;
let gameStartTime = null;
let gameResetTimer = null;
let currentRound = null;
const ADMIN_PASSWORD = '12345678';
function resetGame(){
  players = {};
  teamNames = ['Equipe A','Equipe B'];
  scores = { 'Equipe A':0, 'Equipe B':0 };
  usedWords = new Set();
  acertadas = [];
  puladas = [];
  gameStarted = false;
  gameStartTime = null;
  currentRound = null;
  if(gameResetTimer){ clearTimeout(gameResetTimer); gameResetTimer = null;}
  loadWords();
  io.emit('gameReset');
  emitState();
}
function emitState(){
  io.emit('state', {
    players: Object.values(players).map(p=>({id:p.id,name:p.name,isAdmin:p.isAdmin})),
    teamNames,
    scores,
    acertadas,
    puladas,
    gameStarted,
    gameStartTime,
    currentRound: currentRound ? {
      playerId: currentRound.playerId,
      playerName: players[currentRound.playerId]?.name || null,
      category: currentRound.category,
      team: currentRound.team,
      roundActive: !!currentRound.active,
      timeLeft: currentRound && currentRound.endsAt ? Math.max(0, Math.floor((currentRound.endsAt - Date.now())/1000)) : 0
    } : null,
    categories: Object.keys(wordsData)
  });
}
function scheduleGameReset(){
  if(gameResetTimer) clearTimeout(gameResetTimer);
  gameResetTimer = setTimeout(()=> resetGame(), 3600*1000);
}
function pickWord(category){
  const list = Array.isArray(wordsData[category]) ? wordsData[category] : [];
  const available = list.filter(w => !usedWords.has(category + '||' + w));
  if(available.length === 0) return null;
  const idx = Math.floor(Math.random()*available.length);
  const word = available[idx];
  usedWords.add(category + '||' + word);
  return word;
}
io.on('connection', socket=>{
  socket.on('join', (name)=>{
    players[socket.id] = { id: socket.id, name: (name||'Jogador').slice(0,30), isAdmin:false };
    socket.emit('categories', Object.keys(wordsData));
    emitState();
  });
  socket.on('startGame', ({teamA, teamB, password})=>{
    teamNames[0] = teamA && teamA.trim() !== '' ? teamA.trim().slice(0,30) : 'Equipe A';
    teamNames[1] = teamB && teamB.trim() !== '' ? teamB.trim().slice(0,30) : 'Equipe B';
    scores = {};
    scores[teamNames[0]] = 0;
    scores[teamNames[1]] = 0;
    acertadas = [];
    puladas = [];
    usedWords = new Set();
    gameStarted = true;
    gameStartTime = Date.now();
    if(password === ADMIN_PASSWORD && players[socket.id]){
      players[socket.id].isAdmin = true;
      socket.emit('adminAssigned');
    }
    scheduleGameReset();
    emitState();
  });
  socket.on('startRound', ({category, playerId, team})=>{
    const p = Object.values(players).find(x=>x.id===socket.id && x.isAdmin);
    if(!p) return;
    if(!gameStarted) return;
    if(!players[playerId]) return;
    if(!wordsData[category]) return;
    if(currentRound && currentRound.active) return;
    currentRound = {
      playerId,
      category,
      team,
      active: true,
      endsAt: Date.now() + 75000,
      skipLock: false
    };
    const word = pickWord(category);
    currentRound.currentWord = word;
    io.emit('roundStarted', {
      playerId,
      playerName: players[playerId].name,
      category,
      team,
      endsAt: currentRound.endsAt
    });
    if(word){
      io.to(playerId).emit('newWord', { word });
    } else {
      io.to(playerId).emit('noWord');
    }
    emitState();
    setTimeout(()=>{
      if(currentRound && currentRound.active){
        currentRound.active = false;
        io.emit('roundEnded', {});
        currentRound = null;
        emitState();
      }
    }, 75000);
  });
  socket.on('correct', ()=>{
    if(!currentRound || !currentRound.active) return;
    if(socket.id !== currentRound.playerId) return;
    if(!currentRound.currentWord) return;
    const entry = { word: currentRound.currentWord, player: players[socket.id]?.name || 'Jogador', team: currentRound.team, ts: Date.now(), type: 'acertou' };
    acertadas.push(entry);
    scores[currentRound.team] = (scores[currentRound.team]||0) + 1;
    const next = pickWord(currentRound.category);
    currentRound.currentWord = next;
    io.emit('updateLists', { acertadas, puladas, scores });
    if(next){
      io.to(currentRound.playerId).emit('newWord', { word: next });
    } else {
      io.to(currentRound.playerId).emit('noWord');
    }
    emitState();
  });
  socket.on('skip', ()=>{
    if(!currentRound || !currentRound.active) return;
    if(socket.id !== currentRound.playerId) return;
    if(currentRound.skipLock) return;
    currentRound.skipLock = true;
    const entry = { word: currentRound.currentWord || '', player: players[socket.id]?.name || 'Jogador', team: currentRound.team, ts: Date.now(), type: 'pulou' };
    puladas.push(entry);
    io.emit('skipping', { playerId: socket.id, playerName: players[socket.id]?.name });
    io.emit('updateLists', { acertadas, puladas, scores });
    setTimeout(()=>{
      const next = pickWord(currentRound.category);
      currentRound.currentWord = next;
      currentRound.skipLock = false;
      if(next){
        io.to(currentRound.playerId).emit('newWord', { word: next });
      } else {
        io.to(currentRound.playerId).emit('noWord');
      }
      emitState();
    }, 3000);
  });
  socket.on('adminReset', ()=>{
    const p = players[socket.id];
    if(!p || !p.isAdmin) return;
    resetGame();
  });
  socket.on('requestState', ()=>{
    socket.emit('categories', Object.keys(wordsData));
    emitState();
  });
  socket.on('disconnect', ()=>{
    if(players[socket.id]){
      const wasAdmin = players[socket.id].isAdmin;
      delete players[socket.id];
      if(wasAdmin){
        const remaining = Object.values(players);
        if(remaining.length>0){
          remaining[0].isAdmin = true;
          io.to(remaining[0].id).emit('adminAssigned');
        }
      }
      if(currentRound && currentRound.playerId === socket.id){
        currentRound = null;
        io.emit('roundEnded', {});
      }
      emitState();
    }
  });
});
server.listen(PORT);
