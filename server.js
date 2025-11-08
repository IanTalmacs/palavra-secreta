const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let gameState = {
  players: [],
  teams: { team1: { name: 'Equipe 1', score: 0 }, team2: { name: 'Equipe 2', score: 0 } },
  currentScreen: 1,
  selectedPlayer: null,
  selectedTeam: null,
  selectedCategory: null,
  roundActive: false,
  roundWords: [],
  usedWords: {},
  timer: 0
};

let words = {};
let timerInterval = null;

fs.readFile(path.join(__dirname, 'public', 'words.json'), 'utf8', (err, data) => {
  if (!err) {
    words = JSON.parse(data);
    Object.keys(words).forEach(cat => {
      gameState.usedWords[cat] = [];
    });
  }
});

io.on('connection', (socket) => {
  socket.emit('gameState', gameState);

  socket.on('joinGame', (name) => {
    const isAdmin = name.toLowerCase().includes('admin');
    const displayName = name.replace(/admin/gi, '').trim() || 'Player';
    const player = { id: socket.id, name: displayName, isAdmin };
    gameState.players.push(player);
    io.emit('gameState', gameState);
  });

  socket.on('setTeamNames', ({ team1, team2 }) => {
    gameState.teams.team1.name = team1;
    gameState.teams.team2.name = team2;
    io.emit('gameState', gameState);
  });

  socket.on('selectRoundSettings', ({ category, playerId, team }) => {
    gameState.selectedCategory = category;
    gameState.selectedPlayer = playerId;
    gameState.selectedTeam = team;
    io.emit('gameState', gameState);
  });

  socket.on('startRound', () => {
    if (!gameState.selectedCategory || !gameState.selectedPlayer) return;
    
    gameState.roundActive = true;
    gameState.timer = 75;
    gameState.roundWords = [];
    
    const word = getRandomWord(gameState.selectedCategory);
    if (word) {
      io.to(gameState.selectedPlayer).emit('showWord', word);
    }
    
    io.emit('gameState', gameState);
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      gameState.timer--;
      io.emit('timerUpdate', gameState.timer);
      
      if (gameState.timer <= 0) {
        clearInterval(timerInterval);
        gameState.roundActive = false;
        io.emit('roundEnd');
        io.emit('gameState', gameState);
      }
    }, 1000);
  });

  socket.on('wordCorrect', () => {
    if (!gameState.roundActive) return;
    
    const currentWord = getCurrentWord();
    if (currentWord) {
      gameState.roundWords.push({ word: currentWord, correct: true });
      gameState.teams[gameState.selectedTeam].score++;
      
      const nextWord = getRandomWord(gameState.selectedCategory);
      if (nextWord) {
        io.to(gameState.selectedPlayer).emit('showWord', nextWord);
      }
      io.emit('gameState', gameState);
    }
  });

  socket.on('wordSkip', () => {
    if (!gameState.roundActive) return;
    
    const currentWord = getCurrentWord();
    if (currentWord) {
      gameState.roundWords.push({ word: currentWord, correct: false });
      
      io.to(gameState.selectedPlayer).emit('skipping');
      
      setTimeout(() => {
        const nextWord = getRandomWord(gameState.selectedCategory);
        if (nextWord && gameState.roundActive) {
          io.to(gameState.selectedPlayer).emit('showWord', nextWord);
        }
      }, 3000);
      
      io.emit('gameState', gameState);
    }
  });

  socket.on('changeScreen', (screen) => {
    gameState.currentScreen = screen;
    io.emit('gameState', gameState);
  });

  socket.on('resetGame', () => {
    if (timerInterval) clearInterval(timerInterval);
    gameState = {
      players: [],
      teams: { team1: { name: 'Equipe 1', score: 0 }, team2: { name: 'Equipe 2', score: 0 } },
      currentScreen: 1,
      selectedPlayer: null,
      selectedTeam: null,
      selectedCategory: null,
      roundActive: false,
      roundWords: [],
      usedWords: {},
      timer: 0
    };
    Object.keys(words).forEach(cat => {
      gameState.usedWords[cat] = [];
    });
    io.emit('gameState', gameState);
  });

  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    io.emit('gameState', gameState);
  });
});

function getRandomWord(category) {
  if (!words[category]) return null;
  
  const available = words[category].filter(w => !gameState.usedWords[category].includes(w));
  if (available.length === 0) return null;
  
  const word = available[Math.floor(Math.random() * available.length)];
  gameState.usedWords[category].push(word);
  return word;
}

function getCurrentWord() {
  if (!gameState.selectedCategory) return null;
  const used = gameState.usedWords[gameState.selectedCategory];
  return used[used.length - 1] || null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});