const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static('public'));

const words = JSON.parse(fs.readFileSync('./public/words.json', 'utf8'));

let gameState = {
  players: {},
  team1: [],
  team2: [],
  scores: { team1: 0, team2: 0 },
  adminId: null,
  currentScreen: 1,
  selectedCategory: null,
  selectedPlayer: null,
  availableWords: {},
  currentWord: null,
  correctWords: [],
  skippedWords: [],
  countdown: 0,
  currentTeam: null
};

function resetGame() {
  gameState = {
    players: {},
    team1: [],
    team2: [],
    scores: { team1: 0, team2: 0 },
    adminId: null,
    currentScreen: 1,
    selectedCategory: null,
    selectedPlayer: null,
    availableWords: {},
    currentWord: null,
    correctWords: [],
    skippedWords: [],
    countdown: 0,
    currentTeam: null
  };
}

function updateClients() {
  io.emit('gameState', gameState);
}

io.on('connection', (socket) => {
  socket.emit('gameState', gameState);

  socket.on('setName', (name) => {
    const cleanName = name.replace(/admin/gi, '');
    const isAdmin = name.toLowerCase().includes('admin');
    
    gameState.players[socket.id] = {
      id: socket.id,
      name: cleanName || 'Jogador',
      team: null,
      isAdmin: isAdmin
    };

    if (isAdmin && !gameState.adminId) {
      gameState.adminId = socket.id;
    }

    updateClients();
  });

  socket.on('joinTeam', (team) => {
    if (!gameState.players[socket.id]) return;

    const player = gameState.players[socket.id];
    
    if (player.team === 1) {
      gameState.team1 = gameState.team1.filter(id => id !== socket.id);
    } else if (player.team === 2) {
      gameState.team2 = gameState.team2.filter(id => id !== socket.id);
    }

    player.team = team;
    
    if (team === 1) {
      gameState.team1.push(socket.id);
    } else if (team === 2) {
      gameState.team2.push(socket.id);
    }

    updateClients();
  });

  socket.on('goToCategories', () => {
    if (socket.id !== gameState.adminId) return;
    gameState.currentScreen = 2;
    updateClients();
  });

  socket.on('selectCategory', (category) => {
    if (socket.id !== gameState.adminId) return;
    gameState.selectedCategory = category;
    updateClients();
  });

  socket.on('selectPlayer', (playerId) => {
    if (socket.id !== gameState.adminId) return;
    gameState.selectedPlayer = playerId;
    updateClients();
  });

  socket.on('startRound', () => {
    if (socket.id !== gameState.adminId) return;
    if (!gameState.selectedCategory || !gameState.selectedPlayer) return;

    const player = gameState.players[gameState.selectedPlayer];
    if (!player || !player.team) return;

    gameState.currentTeam = player.team;
    gameState.currentScreen = 3;
    gameState.countdown = 75;
    gameState.correctWords = [];
    gameState.skippedWords = [];

    if (!gameState.availableWords[gameState.selectedCategory]) {
      gameState.availableWords[gameState.selectedCategory] = [...words[gameState.selectedCategory]];
    }

    const availableList = gameState.availableWords[gameState.selectedCategory];
    if (availableList.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableList.length);
      gameState.currentWord = availableList.splice(randomIndex, 1)[0];
    }

    updateClients();

    const countdownInterval = setInterval(() => {
      gameState.countdown--;
      updateClients();

      if (gameState.countdown <= 0) {
        clearInterval(countdownInterval);
        gameState.currentScreen = 4;
        updateClients();
      }
    }, 1000);
  });

  socket.on('correct', () => {
    if (socket.id !== gameState.selectedPlayer) return;
    if (gameState.currentScreen !== 3) return;

    if (gameState.currentWord) {
      gameState.correctWords.push(gameState.currentWord);
      
      if (gameState.currentTeam === 1) {
        gameState.scores.team1++;
      } else if (gameState.currentTeam === 2) {
        gameState.scores.team2++;
      }
    }

    const availableList = gameState.availableWords[gameState.selectedCategory];
    if (availableList && availableList.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableList.length);
      gameState.currentWord = availableList.splice(randomIndex, 1)[0];
    } else {
      gameState.currentWord = null;
    }

    updateClients();
  });

  socket.on('skip', () => {
    if (socket.id !== gameState.selectedPlayer) return;
    if (gameState.currentScreen !== 3) return;

    if (gameState.currentWord) {
      gameState.skippedWords.push(gameState.currentWord);
    }

    io.to(socket.id).emit('skipping', true);

    setTimeout(() => {
      const availableList = gameState.availableWords[gameState.selectedCategory];
      if (availableList && availableList.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableList.length);
        gameState.currentWord = availableList.splice(randomIndex, 1)[0];
      } else {
        gameState.currentWord = null;
      }
      
      io.to(socket.id).emit('skipping', false);
      updateClients();
    }, 3000);
  });

  socket.on('backToCategories', () => {
    if (socket.id !== gameState.adminId) return;
    gameState.currentScreen = 2;
    gameState.selectedCategory = null;
    gameState.selectedPlayer = null;
    updateClients();
  });

  socket.on('adminRefresh', () => {
    if (gameState.players[socket.id]?.isAdmin) {
      resetGame();
      updateClients();
    }
  });

  socket.on('disconnect', () => {
    if (socket.id === gameState.adminId) {
      resetGame();
      updateClients();
    } else {
      if (gameState.players[socket.id]) {
        const player = gameState.players[socket.id];
        
        if (player.team === 1) {
          gameState.team1 = gameState.team1.filter(id => id !== socket.id);
        } else if (player.team === 2) {
          gameState.team2 = gameState.team2.filter(id => id !== socket.id);
        }
        
        delete gameState.players[socket.id];
        updateClients();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});