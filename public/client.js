const socket = io();

let myId = null;
let isAdmin = false;
let gameState = null;
let roundTimer = null;
let currentWord = null;
let skipTimeout = null;

const joinScreen = document.getElementById('join-screen');
const gameScreen = document.getElementById('game-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const lobbyPlayers = document.getElementById('lobby-players');
const team1Players = document.getElementById('team1-players');
const team2Players = document.getElementById('team2-players');
const team1NameInput = document.getElementById('team1-name');
const team2NameInput = document.getElementById('team2-name');
const team1ScoreName = document.getElementById('team1-score-name');
const team2ScoreName = document.getElementById('team2-score-name');
const team1Score = document.getElementById('team1-score');
const team2Score = document.getElementById('team2-score');
const categoryBtns = document.querySelectorAll('.category-btn');
const playerButtons = document.getElementById('player-buttons');
const startRoundBtn = document.getElementById('start-round-btn');
const roundHistory = document.getElementById('round-history');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const resetBtn = document.getElementById('reset-btn');
const roundPopup = document.getElementById('round-popup');
const timerEl = document.getElementById('timer');
const wordDisplay = document.getElementById('word-display');
const skipBtn = document.getElementById('skip-btn');
const correctBtn = document.getElementById('correct-btn');
const screens = document.querySelectorAll('.game-screen-content');

socket.on('myId', (id) => {
    myId = id;
});

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        socket.emit('joinGame', name);
        joinScreen.classList.remove('active');
        gameScreen.classList.add('active');
    }
});

nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

socket.on('gameState', (state) => {
    gameState = state;
    updateUI();
});

function updateUI() {
    if (!myId || !gameState) return;
    
    const me = gameState.players.find(p => p.id === myId);
    isAdmin = me ? me.isAdmin : false;

    lobbyPlayers.innerHTML = '';
    gameState.players.forEach(player => {
        if (!gameState.teams.team1.players.includes(player.id) && 
            !gameState.teams.team2.players.includes(player.id)) {
            const playerDiv = createPlayerDiv(player);
            lobbyPlayers.appendChild(playerDiv);
        }
    });

    team1Players.innerHTML = '';
    gameState.teams.team1.players.forEach(playerId => {
        const player = gameState.players.find(p => p.id === playerId);
        if (player) {
            const playerDiv = createPlayerDiv(player);
            team1Players.appendChild(playerDiv);
        }
    });

    team2Players.innerHTML = '';
    gameState.teams.team2.players.forEach(playerId => {
        const player = gameState.players.find(p => p.id === playerId);
        if (player) {
            const playerDiv = createPlayerDiv(player);
            team2Players.appendChild(playerDiv);
        }
    });

    if (document.activeElement !== team1NameInput) {
        team1NameInput.value = gameState.teams.team1.name;
    }
    if (document.activeElement !== team2NameInput) {
        team2NameInput.value = gameState.teams.team2.name;
    }

    team1ScoreName.textContent = gameState.teams.team1.name;
    team2ScoreName.textContent = gameState.teams.team2.name;
    team1Score.textContent = gameState.teams.team1.score;
    team2Score.textContent = gameState.teams.team2.score;

    categoryBtns.forEach(btn => {
        if (btn.dataset.category === gameState.selectedCategory) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    playerButtons.innerHTML = '';
    gameState.players.forEach(player => {
        const btn = document.createElement('button');
        btn.className = 'player-btn';
        btn.textContent = player.name;
        if (player.id === gameState.selectedPlayer) {
            btn.classList.add('selected');
        }
        btn.addEventListener('click', () => {
            if (isAdmin) {
                socket.emit('selectPlayer', player.id);
            }
        });
        playerButtons.appendChild(btn);
    });

    roundHistory.innerHTML = '';
    gameState.roundHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = `history-word ${item.status}`;
        div.textContent = item.word;
        roundHistory.appendChild(div);
    });

    showScreen(gameState.currentScreen);
}

function createPlayerDiv(player) {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.textContent = player.name;
    div.draggable = isAdmin;
    div.dataset.playerId = player.id;

    if (isAdmin) {
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragend', handleDragEnd);
    }

    return div;
}

let draggedPlayerId = null;

function handleDragStart(e) {
    draggedPlayerId = e.target.dataset.playerId;
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

[lobbyPlayers, team1Players, team2Players].forEach(container => {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', () => {
        container.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');
        
        if (!isAdmin) return;

        const team = container.dataset.team || null;
        socket.emit('moveToTeam', {
            playerId: myId,
            targetPlayerId: draggedPlayerId,
            team: team
        });
    });
});

team1NameInput.addEventListener('change', (e) => {
    if (isAdmin) {
        socket.emit('renameTeam', { team: 'team1', name: e.target.value });
    }
});

team2NameInput.addEventListener('change', (e) => {
    if (isAdmin) {
        socket.emit('renameTeam', { team: 'team2', name: e.target.value });
    }
});

categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (isAdmin) {
            socket.emit('selectCategory', btn.dataset.category);
        }
    });
});

startRoundBtn.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('startRound');
    }
});

prevBtn.addEventListener('click', () => {
    if (isAdmin && gameState.currentScreen > 1) {
        socket.emit('changeScreen', gameState.currentScreen - 1);
    }
});

nextBtn.addEventListener('click', () => {
    if (isAdmin && gameState.currentScreen < 3) {
        socket.emit('changeScreen', gameState.currentScreen + 1);
    }
});

resetBtn.addEventListener('click', () => {
    if (isAdmin && confirm('Tem certeza que deseja resetar o jogo?')) {
        socket.emit('resetGame');
        location.reload();
    }
});

function showScreen(screenNum) {
    screens.forEach((screen, index) => {
        if (index + 1 === screenNum) {
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
        }
    });
}

socket.on('showRoundPopup', () => {
    roundPopup.classList.add('active');
    startRoundTimer();
    requestNewWord();
});

function startRoundTimer() {
    let timeLeft = 75;
    timerEl.textContent = timeLeft;

    roundTimer = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 0) {
            endRound();
        }
    }, 1000);
}

function endRound() {
    clearInterval(roundTimer);
    clearTimeout(skipTimeout);
    roundPopup.classList.remove('active');
    socket.emit('endRound');
}

function requestNewWord() {
    socket.emit('getWord');
}

socket.on('newWord', (word) => {
    currentWord = word;
    wordDisplay.textContent = word;
    skipBtn.disabled = false;
    correctBtn.disabled = false;
    skipBtn.textContent = 'Pular';
});

socket.on('noMoreWords', () => {
    wordDisplay.textContent = 'Sem mais palavras!';
    skipBtn.disabled = true;
    correctBtn.disabled = true;
});

correctBtn.addEventListener('click', () => {
    if (currentWord) {
        socket.emit('wordCorrect', currentWord);
        requestNewWord();
    }
});

skipBtn.addEventListener('click', () => {
    if (currentWord) {
        skipBtn.disabled = true;
        correctBtn.disabled = true;
        skipBtn.textContent = 'Pulando...';
        
        socket.emit('wordSkip', currentWord);
        
        skipTimeout = setTimeout(() => {
            requestNewWord();
        }, 3000);
    }
});