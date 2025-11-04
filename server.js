const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const WORDS_PATH = path.join(__dirname, "public", "words.json");
let rawWords = {};
function loadWords() {
  try {
    rawWords = JSON.parse(fs.readFileSync(WORDS_PATH, "utf8"));
  } catch (e) {
    rawWords = {};
  }
}
loadWords();
let players = {};
let teams = { a: { name: "Equipe A", score: 0 }, b: { name: "Equipe B", score: 0 } };
let adminId = null;
let gameStarted = false;
let usedWords = new Set();
let currentRound = {
  active: false,
  playerId: null,
  category: null,
  teamKey: null,
  startTime: null,
  endTime: null,
  timerHandle: null,
  tickHandle: null,
  remaining: 0,
  currentWord: null,
  correct: [],
  skipped: [],
  skipping: false
};
let inactivityTimer = null;
const INACTIVITY_MS = 60 * 60 * 1000;
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    resetGame();
    io.emit("reset");
  }, INACTIVITY_MS);
}
resetInactivityTimer();
function resetGame() {
  players = {};
  teams = { a: { name: "Equipe A", score: 0 }, b: { name: "Equipe B", score: 0 } };
  adminId = null;
  gameStarted = false;
  usedWords = new Set();
  if (currentRound.timerHandle) clearTimeout(currentRound.timerHandle);
  if (currentRound.tickHandle) clearInterval(currentRound.tickHandle);
  currentRound = {
    active: false,
    playerId: null,
    category: null,
    teamKey: null,
    startTime: null,
    endTime: null,
    timerHandle: null,
    tickHandle: null,
    remaining: 0,
    currentWord: null,
    correct: [],
    skipped: [],
    skipping: false
  };
  loadWords();
  resetInactivityTimer();
}
function pickWord(category) {
  const list = rawWords[category] || [];
  const available = list.filter(w => w && !usedWords.has(category + "||" + w));
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  const word = available[idx];
  usedWords.add(category + "||" + word);
  return word;
}
app.use(express.static(path.join(__dirname, "public")));
io.on("connection", socket => {
  resetInactivityTimer();
  socket.on("join", name => {
    resetInactivityTimer();
    players[socket.id] = { id: socket.id, name: (name || "Anon"), team: null, isAdmin: false };
    io.emit("players", Object.values(players));
    io.to(socket.id).emit("teams", teams);
    io.to(socket.id).emit("gameState", { gameStarted, adminId });
  });
  socket.on("becomeAdmin", password => {
    resetInactivityTimer();
    if (password === "12345678") {
      if (adminId && players[adminId]) {
        io.to(socket.id).emit("adminResult", { ok: false, message: "Já existe um admin" });
      } else {
        adminId = socket.id;
        if (players[socket.id]) players[socket.id].isAdmin = true;
        io.emit("adminResult", { ok: true });
        io.emit("players", Object.values(players));
        io.emit("adminAssigned", adminId);
      }
    } else {
      io.to(socket.id).emit("adminResult", { ok: false, message: "Senha incorreta" });
    }
  });
  socket.on("setTeamNames", data => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    teams.a.name = data.teamA || teams.a.name;
    teams.b.name = data.teamB || teams.b.name;
    io.emit("teams", teams);
  });
  socket.on("startGame", () => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    gameStarted = true;
    io.emit("gameStarted");
    io.emit("teams", teams);
  });
  socket.on("selectPlayerTeamCategory", selection => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    io.emit("selection", selection);
  });
  socket.on("startRound", data => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    if (currentRound.active) return;
    const { playerId, category, teamKey } = data;
    if (!players[playerId]) return;
    currentRound.active = true;
    currentRound.playerId = playerId;
    currentRound.category = category;
    currentRound.teamKey = teamKey;
    currentRound.correct = [];
    currentRound.skipped = [];
    currentRound.startTime = Date.now();
    currentRound.remaining = 75;
    io.emit("categoriesVisible", false);
    io.emit("roundStarted", { playerId, category, teamKey, remaining: currentRound.remaining });
    sendNextWord();
    currentRound.tickHandle = setInterval(() => {
      currentRound.remaining -= 1;
      io.emit("tick", currentRound.remaining);
    }, 1000);
    currentRound.timerHandle = setTimeout(() => {
      endRound();
    }, 75 * 1000);
  });
  function sendNextWord() {
    if (!currentRound.active) return;
    const w = pickWord(currentRound.category);
    currentRound.currentWord = w;
    if (!w) {
      endRound();
      return;
    }
    io.emit("newWord", { word: w, for: currentRound.playerId });
  }
  socket.on("acertou", () => {
    resetInactivityTimer();
    if (!currentRound.active) return;
    if (socket.id !== currentRound.playerId) return;
    if (currentRound.skipping) return;
    const word = currentRound.currentWord;
    if (!word) return;
    currentRound.correct.push(word);
    teams[currentRound.teamKey].score += 1;
    io.emit("teams", teams);
    sendNextWord();
  });
  socket.on("pular", () => {
    resetInactivityTimer();
    if (!currentRound.active) return;
    if (socket.id !== currentRound.playerId) return;
    if (currentRound.skipping) return;
    const word = currentRound.currentWord;
    if (!word) return;
    currentRound.skipping = true;
    currentRound.skipped.push(word);
    io.emit("skipping", { for: currentRound.playerId });
    setTimeout(() => {
      currentRound.skipping = false;
      sendNextWord();
    }, 3000);
  });
  function endRound() {
    if (!currentRound.active) return;
    currentRound.active = false;
    clearTimeout(currentRound.timerHandle);
    clearInterval(currentRound.tickHandle);
    currentRound.timerHandle = null;
    currentRound.tickHandle = null;
    const payload = {
      correct: currentRound.correct,
      skipped: currentRound.skipped,
      teams
    };
    io.emit("roundEnded", payload);
    currentRound.playerId = null;
    currentRound.category = null;
    currentRound.teamKey = null;
    currentRound.currentWord = null;
    currentRound.correct = [];
    currentRound.skipped = [];
    currentRound.remaining = 0;
  }
  socket.on("continue", () => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    io.emit("categoriesVisible", true);
    io.emit("verificationHidden");
  });
  socket.on("reset", () => {
    resetInactivityTimer();
    if (socket.id !== adminId) return;
    resetGame();
    io.emit("reset");
  });
  socket.on("setPlayerTeam", data => {
    resetInactivityTimer();
    const { teamKey } = data;
    if (players[socket.id]) players[socket.id].team = teamKey || null;
    io.emit("players", Object.values(players));
  });
  socket.on("disconnect", () => {
    resetInactivityTimer();
    if (players[socket.id] && players[socket.id].isAdmin) {
      adminId = null;
    }
    delete players[socket.id];
    io.emit("players", Object.values(players));
    if (Object.keys(players).length === 0) {
      resetGame();
    }
  });
});
server.listen(PORT, () => {});
