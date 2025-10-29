const socket = io();

let currentState = {};
let mySocketId = null;
let isAdmin = false;
let skipping = false;

window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
    return '';
});

socket.on('connect', () => {
    mySocketId = socket.id;
});

socket.on('gameState', (state) => {
    currentState = state;
    updateUI();
});

socket.on('timeUpdate', (time) => {
    const timerElement = document.getElementById('timer');
    const timerLargeElement = document.getElementById('timerLarge');
    if (timerElement) timerElement.textContent = time;
    if (timerLargeElement) timerLargeElement.textContent = time;
});

socket.on('skipState', (data) => {
    skipping = data.skipping;
    const skipMessage = document.getElementById('skipMessage');
    const wordDisplay = document.getElementById('wordDisplay');
    const correctBtn = document.getElementById('correctBtn');
    const skipBtn = document.getElementById('skipBtn');
    
    if (skipping) {
        skipMessage.classList.add('active');
        wordDisplay.style.opacity = '0.3';
        correctBtn.disabled = true;
        skipBtn.disabled = true;
    } else {
        skipMessage.classList.remove('active');
        wordDisplay.style.opacity = '1';
        correctBtn.disabled = false;
        skipBtn.disabled = false;
    }
});

function updateUI() {
    const allPlayers = [...currentState.team1, ...currentState.team2];
    const me = allPlayers.find(p => p.id === mySocketId);
    isAdmin = me ? me.isAdmin : false;

    hideAllScreens();

    if (currentState.screen === 1) {
        showScreen1();
    } else if (currentState.screen === 2) {
        showScreen2();
    } else if (currentState.screen === 3) {
        showScreen3();
    } else if (currentState.screen === 4) {
        if (mySocketId === currentState.selectedPlayer) {
            showScreen4a();
        } else {
            showScreen4b();
        }
    } else if (currentState.screen === 5) {
        showScreen5();
    }
}

function hideAllScreens() {
    document.getElementById('screen1').style.display = 'none';
    document.getElementById('screen2').style.display = 'none';
    document.getElementById('screen3').style.display = 'none';
    document.getElementById('screen4a').style.display = 'none';
    document.getElementById('screen4b').style.display = 'none';
    document.getElementById('screen5').style.display = 'none';
}

function showScreen1() {
    document.getElementById('screen1').style.display = 'block';
    
    const team1Players = document.getElementById('team1Players');
    const team2Players = document.getElementById('team2Players');
    
    team1Players.innerHTML = currentState.team1.map(p => 
        `<span class="player-tag">${p.name}</span>`
    ).join('');
    
    team2Players.innerHTML = currentState.team2.map(p => 
        `<span class="player-tag">${p.name}</span>`
    ).join('');

    const categoriesBtn = document.getElementById('categoriesBtn');
    categoriesBtn.disabled = !isAdmin;
}

function showScreen2() {
    document.getElementById('screen2').style.display = 'block';
    
    document.getElementById('score1').textContent = currentState.score.team1;
    document.getElementById('score2').textContent = currentState.score.team2;

    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.disabled = !isAdmin;
    });
}

function showScreen3() {
    document.getElementById('screen3').style.display = 'block';
    
    const playersButtons = document.getElementById('playersButtons');
    const allPlayers = [...currentState.team1, ...currentState.team2];
    
    playersButtons.innerHTML = allPlayers.map(p => {
        const selected = p.id === currentState.selectedPlayer ? 'selected' : '';
        return `<button class="player-btn ${selected}" data-player-id="${p.id}" ${!isAdmin ? 'disabled' : ''}>${p.name}</button>`;
    }).join('');

    const startBtn = document.getElementById('startBtn');
    if (mySocketId === currentState.selectedPlayer) {
        startBtn.style.display = 'block';
        startBtn.disabled = false;
    } else {
        startBtn.style.display = 'none';
    }
}

function showScreen4a() {
    document.getElementById('screen4a').style.display = 'block';
    
    document.getElementById('timer').textContent = currentState.timeLeft;
    document.getElementById('wordDisplay').textContent = currentState.currentWord || '';
}

function showScreen4b() {
    document.getElementById('screen4b').style.display = 'block';
    document.getElementById('timerLarge').textContent = currentState.timeLeft;
}

function showScreen5() {
    document.getElementById('screen5').style.display = 'block';
    
    const correctWords = document.getElementById('correctWords');
    const skippedWords = document.getElementById('skippedWords');
    
    correctWords.innerHTML = currentState.roundResults.correct.map(w => 
        `<span class="word-tag">${w}</span>`
    ).join('');
    
    skippedWords.innerHTML = currentState.roundResults.skipped.map(w => 
        `<span class="word-tag">${w}</span>`
    ).join('');

    const backBtn = document.getElementById('backToCategoriesBtn');
    backBtn.disabled = !isAdmin;
}

document.getElementById('team1Section').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim();
    if (name) {
        socket.emit('joinTeam', { name, team: 1 });
    }
});

document.getElementById('team2Section').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim();
    if (name) {
        socket.emit('joinTeam', { name, team: 2 });
    }
});

document.getElementById('categoriesBtn').addEventListener('click', () => {
    socket.emit('goToCategories');
});

document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        socket.emit('selectCategory', category);
    });
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('player-btn')) {
        const playerId = e.target.dataset.playerId;
        socket.emit('selectPlayer', playerId);
    }
});

document.getElementById('startBtn').addEventListener('click', () => {
    socket.emit('startRound');
});

document.getElementById('correctBtn').addEventListener('click', () => {
    if (!skipping) {
        socket.emit('correctWord');
    }
});

document.getElementById('skipBtn').addEventListener('click', () => {
    if (!skipping) {
        socket.emit('skipWord');
    }
});

document.getElementById('backToCategoriesBtn').addEventListener('click', () => {
    socket.emit('backToCategories');
});