import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = [];
let admin = null;
let teamPoints = { 1: 0, 2: 0 };
let usedWords = [];
let currentCategory = null;
let currentPlayer = null;
let currentWord = null;
let words = JSON.parse(fs.readFileSync("./public/words.json"));
let gameActive = false;

io.on("connection", (socket) => {
  socket.on("join", (name, team) => {
    const isAdmin = name.includes("995");
    const visibleName = name.replace("995", "");
    const player = { id: socket.id, name: visibleName, team, isAdmin };
    players.push(player);
    if (isAdmin) admin = socket.id;
    io.emit("players", players, teamPoints);
  });

  socket.on("chooseCategory", (cat) => {
    if (socket.id !== admin) return;
    currentCategory = cat;
    io.emit("categoryChosen", cat);
  });

  socket.on("choosePlayer", (id) => {
    if (socket.id !== admin) return;
    currentPlayer = id;
    io.emit("playerChosen", id);
  });

  socket.on("startRound", () => {
    if (socket.id !== currentPlayer) return;
    gameActive = true;
    usedWords = [];
    io.emit("startRound", currentPlayer);
  });

  socket.on("getWord", () => {
    if (!currentCategory) return;
    let list = words[currentCategory].filter(w => !usedWords.includes(w));
    if (list.length === 0) return socket.emit("noWords");
    currentWord = list[Math.floor(Math.random() * list.length)];
    usedWords.push(currentWord);
    socket.emit("newWord", currentWord);
  });

  socket.on("correct", () => {
    const player = players.find(p => p.id === currentPlayer);
    if (!player) return;
    teamPoints[player.team]++;
    io.emit("updatePoints", teamPoints);
    socket.emit("getWord");
  });

  socket.on("skip", () => {
    socket.emit("skipping");
    setTimeout(() => socket.emit("getWord"), 3000);
  });

  socket.on("endRound", (results) => {
    gameActive = false;
    io.emit("endRound", results, teamPoints);
    currentPlayer = null;
    currentWord = null;
  });

  socket.on("disconnect", () => {
    players = players.filter(p => p.id !== socket.id);
    if (socket.id === admin) {
      players = [];
      admin = null;
      teamPoints = { 1: 0, 2: 0 };
      usedWords = [];
      currentCategory = null;
      currentPlayer = null;
      io.emit("resetAll");
    } else {
      io.emit("players", players, teamPoints);
    }
  });
});

server.listen(3000, () => console.log("Servidor rodando na porta 3000"));
