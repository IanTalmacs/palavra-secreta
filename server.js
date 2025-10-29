import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

let players = {};
let teams = { team1: [], team2: [] };
let adminId = null;
let screen = 1;
let category = null;
let currentPlayer = null;
let words = JSON.parse(fs.readFileSync("public/words.json"));
let usedWords = [];
let roundWords = [];
let scores = { team1: 0, team2: 0 };

io.on("connection", (socket) => {
  socket.on("join", (name) => {
    if (name.includes("999")) {
      name = name.replace("999", "");
      adminId = socket.id;
    }
    players[socket.id] = { id: socket.id, name, team: "lobby", score: 0 };
    io.emit("updatePlayers", players, teams, screen, category, currentPlayer, scores);
  });

  socket.on("movePlayer", ({ playerId, team }) => {
    if (socket.id !== adminId) return;
    const player = players[playerId];
    if (!player) return;
    ["team1", "team2"].forEach(t => teams[t] = teams[t].filter(p => p.id !== playerId));
    if (team !== "lobby") teams[team].push(player);
    player.team = team;
    io.emit("updatePlayers", players, teams, screen, category, currentPlayer, scores);
  });

  socket.on("goCategories", () => {
    if (socket.id !== adminId) return;
    screen = 2;
    io.emit("updateScreen", screen);
  });

  socket.on("chooseCategory", (cat) => {
    if (socket.id !== adminId) return;
    category = cat;
    screen = 3;
    io.emit("updateScreen", screen, category);
  });

  socket.on("choosePlayer", (pid) => {
    if (socket.id !== adminId) return;
    currentPlayer = pid;
    io.emit("choosePlayer", pid);
  });

  socket.on("startRound", () => {
    if (socket.id !== currentPlayer) return;
    screen = 4;
    const available = words[category].filter(w => !usedWords.includes(w));
    const chosen = available.sort(() => 0.5 - Math.random());
    roundWords = chosen.slice(0, 50);
    io.emit("startRound", currentPlayer);
  });

  socket.on("getWord", () => {
    if (roundWords.length === 0) return socket.emit("noWords");
    const word = roundWords.shift();
    usedWords.push(word);
    socket.emit("newWord", word);
  });

  socket.on("correct", (team) => {
    scores[team]++;
    io.emit("updateScores", scores);
  });

  socket.on("endRound", (results) => {
    screen = 5;
    io.emit("endRound", results, scores);
  });

  socket.on("backToCategories", () => {
    if (socket.id !== adminId) return;
    screen = 2;
    io.emit("updateScreen", screen);
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) delete players[socket.id];
    ["team1", "team2"].forEach(t => teams[t] = teams[t].filter(p => p.id !== socket.id));
    if (socket.id === adminId) {
      players = {};
      teams = { team1: [], team2: [] };
      adminId = null;
      screen = 1;
      usedWords = [];
      scores = { team1: 0, team2: 0 };
      io.emit("resetAll");
    } else io.emit("updatePlayers", players, teams, screen, category, currentPlayer, scores);
  });
});

server.listen(process.env.PORT || 3000);
