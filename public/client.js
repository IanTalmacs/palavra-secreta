const socket = io();

let myId = null;
let isAdmin = false;
let nameConfirmed = false;

const categories = {
    'animais': 'Animais',
    'tv_cinema': 'TV e Cinema',
    'objetos': 'Objetos',
    'lugares': 'Lugares',
    'pessoas': 'Pessoas',
    'esportes_jogos': 'Esportes e Jogos',
    'profissoes': 'Profissões',
    'alimentos': 'Alimentos',
    'personagens': 'Personagens',
    'biblico': 'Bíblico'
};

window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
    
    if (isAdmin) {
        socket.emit('adminRefresh');
    }
});

document.getElementById('confirmNameBtn').addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim();
    if (name) {
        socket.emit('setName', name);
        document.getElementById('nameInput').disabled = true;
        document.getElementById('confirmNameBtn').disabled = true;
        nameConfirmed = true;
    }
});

document.getElementById('team1').addEventListener('click', () => {
    if (nameConfirmed) {
        socket.emit('joinTeam', 1);
    }
});

document.getElementById('team2').addEventListener('click', () => {
    if (nameConfirmed) {
        socket.emit('joinTeam', 2);
    }
});

document.getElementById('goToCategoriesBtn').addEventListener('click', () => {
    socket.emit('goToCategories');
});

document.getElementById('startRoundBtn').addEventListener('click', () => {
    socket.emit('startRound');
});

document.getElementById('correctBtn').addEventListener('click', () => {
    socket.emit('correct');
});

document.getElementById('skipBtn').addEventListener('click', () => {
    socket.emit('skip');
});

document.getElementById('backToCategoriesBtn').addEventListener('click', () => {
    socket.emit('backToCategories');
});

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('gameState', (state) => {
    if (state.players[myId]) {
        isAdmin = state.players[myId].isAdmin;
    }

    updateScreen(state);
});

socket.on('skipping', (isSkipping) => {
    const skippingMsg = document.getElementById('skippingMessage');
    const wordContainer = document.getElementById('currentWord');
    const buttons = document.querySelector('.action-buttons');
    
    if (isSkipping) {
        skippingMsg.style.display = 'block';
        wordContainer.style.opacity = '0.3';
        buttons.style.pointerEvents = 'none';
    } else {
        skippingMsg.style.display = 'none';
        wordContainer.style.opacity = '1';
        buttons.style.pointerEvents = 'auto';
    }
});

function updateScreen(state) {
    document.getElementById('screen1').style.display = 'none';
    document.getElementById('screen2').style.display = 'none';
    document.getElementById('screen3').style.display = 'none';
    document.getElementById('screen4').style.display = 'none';

    if (state.currentScreen === 1) {
        showScreen1(state);
    } else if (state.currentScreen === 2) {
        showScreen2(state);
    } else if (state.currentScreen === 3) {
        showScreen3(state);
    } else if (state.currentScreen === 4) {
        showScreen4(state);
    }
}

function showScreen1(state) {
    document.getElementById('screen1').style.display = 'block';

    const team1Container = document.getElementById('team1');
    const team2Container = document.getElementById('team2');
    
    team1Container.innerHTML = '';
    team2Container.innerHTML = '';

    state.team1.forEach(playerId => {
        const player = state.players[playerId];
        if (player) {
            const tag = document.createElement('span');
            tag.className = 'player-tag';
            tag.textContent = player.name;
            team1Container.appendChild(tag);
        }
    });

    state.team2.forEach(playerId => {
        const player = state.players[playerId];
        if (player) {
            const tag = document.createElement('span');
            tag.className = 'player-tag';
            tag.textContent = player.name;
            team2Container.appendChild(tag);
        }
    });

    const goBtn = document.getElementById('goToCategoriesBtn');
    if (isAdmin) {
        goBtn.style.display = 'block';
    } else {
        goBtn.style.display = 'none';
    }
}

function showScreen2(state) {
    document.getElementById('screen2').style.display = 'block';

    document.getElementById('score1').textContent = state.scores.team1;
    document.getElementById('score2').textContent = state.scores.team2;

    const categoriesContainer = document.getElementById('categoriesContainer');
    categoriesContainer.innerHTML = '';

    Object.keys(categories).forEach(catKey => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.textContent = categories[catKey];
        
        if (state.selectedCategory === catKey) {
            btn.classList.add('selected');
        }

        if (isAdmin) {
            btn.addEventListener('click', () => {
                socket.emit('selectCategory', catKey);
            });
        } else {
            btn.style.cursor = 'default';
            btn.style.opacity = '0.7';
        }

        categoriesContainer.appendChild(btn);
    });

    const playersContainer = document.getElementById('playersContainer');
    playersContainer.innerHTML = '';

    Object.values(state.players).forEach(player => {
        if (player.team) {
            const btn = document.createElement('button');
            btn.className = 'player-btn';
            btn.textContent = `${player.name} (Equipe ${player.team})`;
            
            if (state.selectedPlayer === player.id) {
                btn.classList.add('selected');
            }

            if (isAdmin) {
                btn.addEventListener('click', () => {
                    socket.emit('selectPlayer', player.id);
                });
            } else {
                btn.style.cursor = 'default';
                btn.style.opacity = '0.7';
            }

            playersContainer.appendChild(btn);
        }
    });

    const startBtn = document.getElementById('startRoundBtn');
    if (isAdmin) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }
}

function showScreen3(state) {
    document.getElementById('screen3').style.display = 'block';

    document.getElementById('countdown').textContent = state.countdown;

    const wordContainer = document.getElementById('wordContainer');
    
    if (state.selectedPlayer === myId) {
        wordContainer.style.display = 'block';
        document.getElementById('currentWord').textContent = state.currentWord || 'Sem palavras';
    } else {
        wordContainer.style.display = 'none';
    }
}

function showScreen4(state) {
    document.getElementById('screen4').style.display = 'block';

    const correctList = document.getElementById('correctWordsList');
    const skippedList = document.getElementById('skippedWordsList');

    correctList.innerHTML = '';
    skippedList.innerHTML = '';

    if (state.correctWords.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.color = '#b3b3b3';
        emptyMsg.style.padding = '10px';
        emptyMsg.textContent = 'Nenhuma palavra acertada';
        correctList.appendChild(emptyMsg);
    } else {
        state.correctWords.forEach(word => {
            const item = document.createElement('span');
            item.className = 'word-item correct';
            item.textContent = word;
            correctList.appendChild(item);
        });
    }

    if (state.skippedWords.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.color = '#b3b3b3';
        emptyMsg.style.padding = '10px';
        emptyMsg.textContent = 'Nenhuma palavra pulada';
        skippedList.appendChild(emptyMsg);
    } else {
        state.skippedWords.forEach(word => {
            const item = document.createElement('span');
            item.className = 'word-item skipped';
            item.textContent = word;
            skippedList.appendChild(item);
        });
    }

    const backBtn = document.getElementById('backToCategoriesBtn');
    if (isAdmin) {
        backBtn.style.display = 'block';
    } else {
        backBtn.style.display = 'none';
    }
}