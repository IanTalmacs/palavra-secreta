const socket = io();

let myId = null;
let isAdmin = false;
let gameState = null;

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('gameState', (state) => {
  gameState = state;
  updateUI();
});

socket.on('timerUpdate', (time) => {
  document.getElementById('timer').textContent = time;
});

socket.on('showWord', (word) => {
  document.getElementById('currentWord').textContent = word;
  document.getElementById('roundPopup').classList.remove('hidden');
  document.getElementById('skippingMsg').classList.add('hidden');
});

socket.on('roundEnd', () => {
  document.getElementById('roundPopup').classList.add('hidden');
});

socket.on('skipping', () => {
  document.getElementById('skippingMsg').classList.remove('hidden');
  document.getElementById('currentWord').textContent = '';
});

document.getElementById('joinBtn').addEventListener('click', () => {
  const name = document.getElementById('nameInput').value.trim();
  if (name) {
    socket.emit('joinGame', name);
    document.getElementById('nameInput').value = '';
  }
});

document.getElementById('setTeamsBtn').addEventListener('click', () => {
  const team1 = document.getElementById('team1Input').value.trim() || 'Equipe 1';
  const team2 = document.getElementById('team2Input').value.trim() || 'Equipe 2';
  socket.emit('setTeamNames', { team1, team2 });
});

document.getElementById('startRoundBtn').addEventListener('click', () => {
  const category = document.getElementById('categorySelect').value;
  const playerId = document.getElementById('playerSelect').value;
  const team = document.getElementById('teamSelect').value;
  
  if (category && playerId && team) {
    socket.emit('selectRoundSettings', { category, playerId, team });
    socket.emit('startRound');
  }
});

document.getElementById('correctBtn').addEventListener('click', () => {
  socket.emit('wordCorrect');
});

document.getElementById('skipBtn').addEventListener('click', () => {
  socket.emit('wordSkip');
});

document.getElementById('prevBtn').addEventListener('click', () => {
  if (gameState.currentScreen > 1) {
    socket.emit('changeScreen', gameState.currentScreen - 1);
  }
});

document.getElementById('nextBtn').addEventListener('click', () => {
  if (gameState.currentScreen < 3) {
    socket.emit('changeScreen', gameState.currentScreen + 1);
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Resetar o jogo completamente?')) {
    socket.emit('resetGame');
  }
});

function updateUI() {
  if (!gameState) return;
  
  const player = gameState.players.find(p => p.id === myId);
  isAdmin = player ? player.isAdmin : false;
  
  document.getElementById('navigation').style.display = isAdmin ? 'flex' : 'none';
  
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`screen${i}`).classList.toggle('hidden', gameState.currentScreen !== i);
  }
  
  const playersList = document.getElementById('playersList');
  playersList.innerHTML = gameState.players.map(p => 
    `<div class="player-item">${p.name}</div>`
  ).join('');
  
  const playerSelect = document.getElementById('playerSelect');
  playerSelect.innerHTML = '<option value="">Selecione Player</option>' + 
    gameState.players.map(p => 
      `<option value="${p.id}">${p.name}</option>`
    ).join('');
  
  document.getElementById('team1Name').textContent = gameState.teams.team1.name;
  document.getElementById('team1Score').textContent = gameState.teams.team1.score;
  document.getElementById('team2Name').textContent = gameState.teams.team2.name;
  document.getElementById('team2Score').textContent = gameState.teams.team2.score;
  
  const wordsHistory = document.getElementById('wordsHistory');
  wordsHistory.innerHTML = gameState.roundWords.map(w => 
    `<div class="word-item ${w.correct ? 'word-correct' : 'word-skip'}">${w.word}</div>`
  ).join('');
}