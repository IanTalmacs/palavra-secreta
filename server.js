const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DATA_PATH = path.join(__dirname, "public", "words.json");
let wordsByCategory = {};
function loadWords(){
  try{
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    wordsByCategory = JSON.parse(raw);
  }catch(e){
    wordsByCategory = {};
  }
}
loadWords();
fs.watchFile(DATA_PATH, ()=>{ loadWords(); });
app.use(express.static(path.join(__dirname, "public")));
let gameState = {
  scores: [0,0],
  usedWords: new Set(),
  players: {},
  adminId: null,
  currentRound: null,
  inactivityTimer: null
};
function broadcastPlayers(){
  const list = Object.values(gameState.players).map(p=>({id:p.id,name:p.name,isAdmin:p.isAdmin}));
  io.emit("players_update", list);
}
function resetGame(broadcast=true){
  gameState.scores = [0,0];
  gameState.usedWords = new Set();
  if(gameState.currentRound && gameState.currentRound.interval) clearInterval(gameState.currentRound.interval);
  if(gameState.currentRound && gameState.currentRound.skipTimeout) clearTimeout(gameState.currentRound.skipTimeout);
  gameState.currentRound = null;
  if(broadcast) io.emit("reset_game");
}
function touchActivity(){
  if(gameState.inactivityTimer) clearTimeout(gameState.inactivityTimer);
  gameState.inactivityTimer = setTimeout(()=>{ resetGame(true); }, 2*60*60*1000);
}
function pickWord(category){
  const arr = Array.isArray(wordsByCategory[category]) ? wordsByCategory[category] : [];
  const pool = arr.filter(w=> w && !gameState.usedWords.has(w));
  if(pool.length===0) return null;
  const idx = Math.floor(Math.random()*pool.length);
  const word = pool[idx];
  gameState.usedWords.add(word);
  return word;
}
function endRound(){
  if(!gameState.currentRound) return;
  const r = gameState.currentRound;
  if(r.interval) clearInterval(r.interval);
  if(r.skipTimeout) clearTimeout(r.skipTimeout);
  const payload = { words: r.wordsRound, playerId: r.target, category: r.category };
  io.emit("round_ended", payload);
  gameState.currentRound = null;
  touchActivity();
}
io.on("connection", (socket)=>{
  const name = "Player-"+socket.id.slice(-4);
  gameState.players[socket.id] = { id: socket.id, name, isAdmin:false };
  broadcastPlayers();
  touchActivity();
  socket.on("register", (data)=>{
    if(data && data.role==="admin"){
      if(String(data.password) === "12345678"){
        gameState.players[socket.id].isAdmin = true;
        gameState.adminId = socket.id;
        socket.emit("register_result", { success:true, isAdmin:true, state:{ scores: gameState.scores } });
        broadcastPlayers();
        touchActivity();
        return;
      }else{
        socket.emit("register_result", { success:false });
        return;
      }
    }
    socket.emit("register_result", { success:true, isAdmin:false, state:{ scores: gameState.scores } });
    touchActivity();
  });
  socket.on("score_change", (payload)=>{
    const p = gameState.players[socket.id];
    if(!p || !p.isAdmin) return;
    const {team,delta} = payload;
    if(team!==0 && team!==1) return;
    gameState.scores[team] = Math.max(0, (gameState.scores[team]||0) + (delta||0));
    io.emit("score_update", { scores: gameState.scores });
    touchActivity();
  });
  socket.on("reset", ()=>{
    const p = gameState.players[socket.id];
    if(!p || !p.isAdmin) return;
    resetGame(true);
    io.emit("go_screen", { screen:1 });
    touchActivity();
  });
  socket.on("start_round", ({category,targetId})=>{
    const p = gameState.players[socket.id];
    if(!p || !p.isAdmin) return;
    if(!gameState.players[targetId]) return;
    if(gameState.currentRound) return;
    const word = pickWord(category);
    const round = { id: Date.now()+"-"+Math.random(), target: targetId, category, wordsRound: [], remaining:75, interval:null, skipTimeout:null };
    gameState.currentRound = round;
    io.to(targetId).emit("round_started", { remaining: round.remaining });
    if(word===null){
      endRound();
      return;
    }
    io.to(targetId).emit("new_word", { word });
    round.interval = setInterval(()=>{
      if(!gameState.currentRound) return;
      round.remaining -=1;
      io.to(targetId).emit("round_tick", { remaining: round.remaining });
      if(round.remaining<=0){
        endRound();
      }
    },1000);
    touchActivity();
  });
  socket.on("acertou", ()=>{
    const r = gameState.currentRound;
    if(!r || socket.id !== r.target) return;
    const lastWord = null;
    if(!r.lastCurrentWord) return;
    r.wordsRound.push({ word: r.lastCurrentWord, status: "guessed" });
    const next = pickWord(r.category);
    r.lastCurrentWord = null;
    if(r.skipTimeout){ clearTimeout(r.skipTimeout); r.skipTimeout = null; }
    if(next===null){
      endRound();
      return;
    }
    r.lastCurrentWord = next;
    io.to(r.target).emit("new_word", { word: next });
    touchActivity();
  });
  socket.on("pular", ()=>{
    const r = gameState.currentRound;
    if(!r || socket.id !== r.target) return;
    if(!r.lastCurrentWord){
      return;
    }
    r.wordsRound.push({ word: r.lastCurrentWord, status: "skipped" });
    r.lastCurrentWord = null;
    io.to(r.target).emit("puling");
    r.skipTimeout = setTimeout(()=>{
      r.skipTimeout = null;
      const next = pickWord(r.category);
      if(next===null){
        endRound();
        return;
      }
      r.lastCurrentWord = next;
      io.to(r.target).emit("new_word", { word: next });
    }, 3000);
    touchActivity();
  });
  socket.on("request_next_word", ()=>{
    const r = gameState.currentRound;
    if(!r || socket.id !== r.target) return;
    const next = pickWord(r.category);
    if(next===null){
      endRound();
      return;
    }
    r.lastCurrentWord = next;
    io.to(r.target).emit("new_word", { word: next });
    touchActivity();
  });
  socket.on("continue_after_round", ()=>{
    gameState.currentRound = gameState.currentRound;
    io.emit("after_round_continue");
    touchActivity();
  });
  socket.on("open_categories", ()=>{
    const p = gameState.players[socket.id];
    if(!p || !p.isAdmin) return;
    socket.emit("show_screen", { screen:3 });
    touchActivity();
  });
  socket.on("disconnect", ()=>{
    const wasAdmin = gameState.players[socket.id] && gameState.players[socket.id].isAdmin;
    delete gameState.players[socket.id];
    if(wasAdmin && gameState.adminId === socket.id) gameState.adminId = null;
    if(gameState.currentRound && gameState.currentRound.target === socket.id){
      endRound();
    }
    broadcastPlayers();
    touchActivity();
  });
  socket.on("get_state", ()=>{
    socket.emit("state", { scores: gameState.scores, players: Object.values(gameState.players), categories: Object.keys(wordsByCategory) });
  });
});
server.listen(process.env.PORT || 3000, ()=>{});
