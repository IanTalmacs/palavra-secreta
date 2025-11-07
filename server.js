const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));

let gameState = {
  players: [],
  teams: {
    team1: { name: 'Equipe 1', players: [], score: 0 },
    team2: { name: 'Equipe 2', players: [], score: 0 }
  },
  selectedCategory: null,
  selectedPlayer: null,
  currentScreen: 1,
  roundActive: false,
  usedWords: [],
  roundHistory: [],
  adminSet: false,
  gameStartTime: null,
  gameTimeout: null
};

let words = {};

try {
  const wordsData = fs.readFileSync(path.join(__dirname, 'public', 'words.json'), 'utf8');
  words = JSON.parse(wordsData);
} catch (err) {
  console.error('Error loading words:', err);
}

function resetGame() {
  clearTimeout(gameState.gameTimeout);
  gameState = {
    players: [],
    teams: {
      team1: { name: 'Equipe 1', players: [], score: 0 },
      team2: { name: 'Equipe 2', players: [], score: 0 }
    },
    selectedCategory: null,
    selectedPlayer: null,
    currentScreen: 1,
    roundActive: false,
    usedWords: [],
    roundHistory: [],
    adminSet: false,
    gameStartTime: null,
    gameTimeout: null
  };
  io.emit('gameState', gameState);
}

function setGameTimeout() {
  if (gameState.gameTimeout) {
    clearTimeout(gameState.gameTimeout);
  }
  gameState.gameTimeout = setTimeout(() => {
    resetGame();
  }, 2 * 60 * 60 * 1000);
}

io.on('connection', (socket) => {
  socket.emit('gameState', gameState);

  socket.on('joinGame', (name) => {
    const isAdmin = name.toLowerCase().includes('admin');
    const player = {
      id: socket.id,
      name: name,
      isAdmin: isAdmin
    };
    
    gameState.players.push(player);
    
    if (isAdmin && !gameState.adminSet) {
      gameState.adminSet = true;
      gameState.gameStartTime = Date.now();
      setGameTimeout();
    }
    
    io.emit('gameState', gameState);
  });

  socket.on('moveToTeam', (data) => {
    const player = gameState.players.find(p => p.id === data.playerId);
    if (!player || !player.isAdmin) return;

    gameState.teams.team1.players = gameState.teams.team1.players.filter(id => id !== data.targetPlayerId);
    gameState.teams.team2.players = gameState.teams.team2.players.filter(id => id !== data.targetPlayerId);

    if (data.team === 'team1') {
      gameState.teams.team1.players.push(data.targetPlayerId);
    } else if (data.team === 'team2') {
      gameState.teams.team2.players.push(data.targetPlayerId);
    }

    io.emit('gameState', gameState);
  });

  socket.on('renameTeam', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    if (data.team === 'team1') {
      gameState.teams.team1.name = data.name;
    } else if (data.team === 'team2') {
      gameState.teams.team2.name = data.name;
    }

    io.emit('gameState', gameState);
  });

  socket.on('selectCategory', (category) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    gameState.selectedCategory = category;
    io.emit('gameState', gameState);
  });

  socket.on('selectPlayer', (playerId) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    gameState.selectedPlayer = playerId;
    io.emit('gameState', gameState);
  });

  socket.on('startRound', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;
    if (!gameState.selectedCategory || !gameState.selectedPlayer) return;

    gameState.currentScreen = 3;
    gameState.roundActive = true;
    gameState.roundHistory = [];
    
    io.emit('gameState', gameState);
    io.to(gameState.selectedPlayer).emit('showRoundPopup');
  });

  socket.on('getWord', () => {
    if (socket.id !== gameState.selectedPlayer) return;
    if (!gameState.selectedCategory) return;

    const categoryWords = words[gameState.selectedCategory] || [];
    const availableWords = categoryWords.filter(w => !gameState.usedWords.includes(w));
    
    if (availableWords.length === 0) {
      socket.emit('noMoreWords');
      return;
    }

    const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    gameState.usedWords.push(randomWord);
    socket.emit('newWord', randomWord);
  });

  socket.on('wordCorrect', (word) => {
    if (socket.id !== gameState.selectedPlayer) return;

    const selectedPlayerObj = gameState.players.find(p => p.id === gameState.selectedPlayer);
    let team = null;
    
    if (gameState.teams.team1.players.includes(gameState.selectedPlayer)) {
      team = 'team1';
      gameState.teams.team1.score++;
    } else if (gameState.teams.team2.players.includes(gameState.selectedPlayer)) {
      team = 'team2';
      gameState.teams.team2.score++;
    }

    gameState.roundHistory.push({ word, status: 'correct' });
    io.emit('gameState', gameState);
  });

  socket.on('wordSkip', (word) => {
    if (socket.id !== gameState.selectedPlayer) return;

    gameState.roundHistory.push({ word, status: 'skip' });
    io.emit('gameState', gameState);
  });

  socket.on('endRound', () => {
    if (socket.id !== gameState.selectedPlayer) return;

    gameState.roundActive = false;
    io.emit('gameState', gameState);
  });

  socket.on('changeScreen', (screen) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    gameState.currentScreen = screen;
    io.emit('gameState', gameState);
  });

  socket.on('resetGame', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    resetGame();
  });

  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    gameState.teams.team1.players = gameState.teams.team1.players.filter(id => id !== socket.id);
    gameState.teams.team2.players = gameState.teams.team2.players.filter(id => id !== socket.id);
    
    if (gameState.selectedPlayer === socket.id) {
      gameState.selectedPlayer = null;
    }

    io.emit('gameState', gameState);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});