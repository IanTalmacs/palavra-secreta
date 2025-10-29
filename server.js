const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

let players = {};
let teams = { 1: [], 2: [] };
let admin = null;
let screen = 1;
let selectedCategory = null;
let selectedPlayer = null;
let words = [];
let usedWords = [];
let currentWord = null;
let timer = null;
let timeLeft = 0;
let results = [];
let scores = { 1: 0, 2: 0 };

function resetGame() {
  players = {};
  teams = { 1: [], 2: [] };
  admin = null;
  screen = 1;
  selectedCategory = null;
  selectedPlayer = null;
  words = JSON.parse(fs.readFileSync('./public/words.json'));
  usedWords = [];
  currentWord = null;
  results = [];
  scores = { 1: 0, 2: 0 };
}

resetGame();

io.on('connection', socket => {
  socket.on('join', name => {
    const isAdmin = name.includes('995');
    const cleanName = name.replace('995', '');
    players[socket.id] = { name: cleanName, team: null, admin: isAdmin };
    if (isAdmin) admin = socket.id;
    io.emit('state', { players, teams, admin, screen, scores });
  });

  socket.on('joinTeam', team => {
    if (players[socket.id]) {
      if (teams[1].includes(socket.id)) teams[1] = teams[1].filter(p => p !== socket.id);
      if (teams[2].includes(socket.id)) teams[2] = teams[2].filter(p => p !== socket.id);
      teams[team].push(socket.id);
      players[socket.id].team = team;
      io.emit('state', { players, teams, admin, screen, scores });
    }
  });

  socket.on('showCategories', () => {
    if (socket.id === admin) {
      screen = 2;
      io.emit('state', { players, teams, admin, screen, scores });
    }
  });

  socket.on('selectCategory', category => {
    if (socket.id === admin) {
      selectedCategory = category;
      screen = 3;
      io.emit('state', { players, teams, admin, screen, scores });
    }
  });

  socket.on('choosePlayer', pid => {
    if (socket.id === admin) {
      selectedPlayer = pid;
      io.emit('playerChosen', pid);
    }
  });

  socket.on('startRound', () => {
    if (socket.id === selectedPlayer) {
      screen = 4;
      results = [];
      usedWords = [];
      nextWord();
      timeLeft = 75;
      io.emit('roundStart', { screen, selectedPlayer, currentWord, timeLeft });
      timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(timer);
          screen = 5;
          io.emit('showResults', { screen, results, scores });
        } else {
          io.emit('timer', timeLeft);
        }
      }, 1000);
    }
  });

  socket.on('correct', () => {
    const team = players[selectedPlayer].team;
    scores[team]++;
    results.push({ word: currentWord, correct: true });
    nextWord();
    io.emit('newWord', { currentWord, scores });
  });

  socket.on('skip', () => {
    results.push({ word: currentWord, correct: false });
    io.emit('skipping');
    setTimeout(() => {
      nextWord();
      io.emit('newWord', { currentWord, scores });
    }, 3000);
  });

  socket.on('backToCategories', () => {
    if (socket.id === admin) {
      screen = 2;
      io.emit('state', { players, teams, admin, screen, scores });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    teams[1] = teams[1].filter(p => p !== socket.id);
    teams[2] = teams[2].filter(p => p !== socket.id);
    if (socket.id === admin) {
      resetGame();
      io.emit('reset');
    } else {
      io.emit('state', { players, teams, admin, screen, scores });
    }
  });
});

function nextWord() {
  const categoryWords = words[selectedCategory] || [];
  const available = categoryWords.filter(w => !usedWords.includes(w));
  if (available.length === 0) usedWords = [];
  currentWord = available[Math.floor(Math.random() * available.length)];
  usedWords.push(currentWord);
}

server.listen(process.env.PORT || 3000);
