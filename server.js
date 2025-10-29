const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

const gameState = {
  team1: [],
  team2: [],
  admin: null,
  screen: 1,
  selectedCategory: null,
  selectedPlayer: null,
  score: { team1: 0, team2: 0 },
  usedWords: [],
  currentWord: null,
  roundResults: { correct: [], skipped: [] },
  timeLeft: 75
};

let words = {};
try {
  words = JSON.parse(fs.readFileSync('./public/words.json', 'utf8'));
} catch (err) {
  console.log('Erro ao carregar words.json');
}

io.on('connection', (socket) => {
  socket.emit('gameState', gameState);

  socket.on('joinTeam', (data) => {
    const playerName = data.name.replace('995', '');
    const isAdmin = data.name.includes('995');
    const team = data.team;

    const player = {
      id: socket.id,
      name: playerName,
      isAdmin: isAdmin,
      team: team
    };

    if (team === 1) {
      gameState.team1 = gameState.team1.filter(p => p.id !== socket.id);
      gameState.team2 = gameState.team2.filter(p => p.id !== socket.id);
      gameState.team1.push(player);
    } else {
      gameState.team1 = gameState.team1.filter(p => p.id !== socket.id);
      gameState.team2 = gameState.team2.filter(p => p.id !== socket.id);
      gameState.team2.push(player);
    }

    if (isAdmin) {
      gameState.admin = socket.id;
    }

    io.emit('gameState', gameState);
  });

  socket.on('goToCategories', () => {
    if (socket.id === gameState.admin) {
      gameState.screen = 2;
      io.emit('gameState', gameState);
    }
  });

  socket.on('selectCategory', (category) => {
    if (socket.id === gameState.admin) {
      gameState.selectedCategory = category;
      gameState.screen = 3;
      io.emit('gameState', gameState);
    }
  });

  socket.on('selectPlayer', (playerId) => {
    if (socket.id === gameState.admin) {
      gameState.selectedPlayer = playerId;
      io.emit('gameState', gameState);
    }
  });

  socket.on('startRound', () => {
    if (socket.id === gameState.selectedPlayer) {
      gameState.screen = 4;
      gameState.roundResults = { correct: [], skipped: [] };
      gameState.usedWords = [];
      gameState.timeLeft = 75;
      
      const categoryWords = words[gameState.selectedCategory] || [];
      const availableWords = categoryWords.filter(w => !gameState.usedWords.includes(w));
      if (availableWords.length > 0) {
        gameState.currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        gameState.usedWords.push(gameState.currentWord);
      }

      io.emit('gameState', gameState);
      startTimer();
    }
  });

  socket.on('correctWord', () => {
    if (socket.id === gameState.selectedPlayer && gameState.screen === 4) {
      gameState.roundResults.correct.push(gameState.currentWord);
      
      const player = [...gameState.team1, ...gameState.team2].find(p => p.id === gameState.selectedPlayer);
      if (player) {
        if (player.team === 1) {
          gameState.score.team1++;
        } else {
          gameState.score.team2++;
        }
      }

      const categoryWords = words[gameState.selectedCategory] || [];
      const availableWords = categoryWords.filter(w => !gameState.usedWords.includes(w));
      if (availableWords.length > 0) {
        gameState.currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        gameState.usedWords.push(gameState.currentWord);
      } else {
        gameState.currentWord = 'Sem mais palavras!';
      }

      io.emit('gameState', gameState);
    }
  });

  socket.on('skipWord', () => {
    if (socket.id === gameState.selectedPlayer && gameState.screen === 4) {
      gameState.roundResults.skipped.push(gameState.currentWord);
      io.emit('skipState', { skipping: true });

      setTimeout(() => {
        const categoryWords = words[gameState.selectedCategory] || [];
        const availableWords = categoryWords.filter(w => !gameState.usedWords.includes(w));
        if (availableWords.length > 0) {
          gameState.currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
          gameState.usedWords.push(gameState.currentWord);
        } else {
          gameState.currentWord = 'Sem mais palavras!';
        }

        io.emit('skipState', { skipping: false });
        io.emit('gameState', gameState);
      }, 3000);
    }
  });

  socket.on('backToCategories', () => {
    if (socket.id === gameState.admin) {
      gameState.screen = 2;
      gameState.selectedPlayer = null;
      io.emit('gameState', gameState);
    }
  });

  socket.on('disconnect', () => {
    gameState.team1 = gameState.team1.filter(p => p.id !== socket.id);
    gameState.team2 = gameState.team2.filter(p => p.id !== socket.id);
    
    if (socket.id === gameState.admin) {
      gameState.admin = null;
    }

    io.emit('gameState', gameState);
  });
});

let timerInterval;

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    gameState.timeLeft--;
    io.emit('timeUpdate', gameState.timeLeft);

    if (gameState.timeLeft <= 0) {
      clearInterval(timerInterval);
      gameState.screen = 5;
      io.emit('gameState', gameState);
    }
  }, 1000);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});s