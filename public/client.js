const socket = io();
let isAdmin = false;
let selectedPlayer = null;
let countdownInterval;

const screens = {
    screen1: document.getElementById('screen1'),
    screen2: document.getElementById('screen2'),
    screen3: document.getElementById('screen3'),
    screen4: document.getElementById('screen4')
};

const nameInput = document.getElementById('nameInput');
const confirmName = document.getElementById('confirmName');
const teamsBtn = document.querySelectorAll('.teamBtn');
const categoriesBtn = document.getElementById('categoriesBtn');
const scoreBoard = document.getElementById('scoreBoard');
const categoryButtons = document.getElementById('categoryButtons');
const playerButtons = document.getElementById('playerButtons');
const startRoundBtn = document.getElementById('startRound');
const wordDisplay = document.getElementById('wordDisplay');
const correctBtn = document.getElementById('correct');
const skipBtn = document.getElementById('skip');
const countdownEl = document.getElementById('countdown');
const resultsEl = document.getElementById('results');
const backToCategories = document.getElementById('backToCategories');

confirmName.onclick = () => socket.emit('setName', nameInput.value);
teamsBtn.forEach(btn => btn.onclick = () => socket.emit('joinTeam', Number(btn.dataset.team)));
categoriesBtn.onclick = () => isAdmin && showScreen2();
backToCategories.onclick = () => isAdmin && showScreen2();

startRoundBtn.onclick = () => {
    if (!isAdmin || !selectedPlayer) return;
    socket.emit('startRound', {selectedPlayer});
};

correctBtn.onclick = () => socket.emit('correct', socket.id);
skipBtn.onclick = () => socket.emit('skip', socket.id);

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

function showScreen2() {
    showScreen('screen2');
}

socket.on('isAdmin', () => isAdmin = true);

socket.on('updatePlayers', (players, teams, scores) => {
    scoreBoard.textContent = `Placar: 1 - ${scores[1]} | 2 - ${scores[2]}`;
    playerButtons.innerHTML = '';
    Object.keys(players).forEach(id => {
        const btn = document.createElement('button');
        btn.textContent = players[id].name;
        btn.onclick = () => isAdmin ? selectedPlayer = id : null;
        playerButtons.appendChild(btn);
    });
});

socket.on('categorySelected', category => console.log('Categoria:', category));

socket.on('roundStarted', playerId => {
    if (socket.id === playerId) showScreen('screen3');
    else showScreen('screen3');
    let time = 75;
    countdownEl.textContent = time;
    countdownInterval = setInterval(() => {
        time--;
        countdownEl.textContent = time;
        if (time <= 0) clearInterval(countdownInterval);
    }, 1000);
});

socket.on('showWord', word => wordDisplay.textContent = word);
socket.on('skipping', () => wordDisplay.textContent = 'Pulando...');
socket.on('updateScores', scores => scoreBoard.textContent = `Placar: 1 - ${scores[1]} | 2 - ${scores[2]}`);
socket.on('roundEnded', () => showScreen('screen4'));
socket.on('reset', () => showScreen('screen1'));

window.addEventListener('beforeunload', e => {
    e.preventDefault();
    e.returnValue = '';
});
