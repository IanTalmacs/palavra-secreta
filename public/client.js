const socket = io();

// UI elements
const screens = {
  s1: document.getElementById('screen-1'),
  s2: document.getElementById('screen-2'),
  s3: document.getElementById('screen-3'),
  s4a: document.getElementById('screen-4a'),
  s4b: document.getElementById('screen-4b'),
  s5: document.getElementById('screen-5')
};

function show(screen) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// screen1 elements
const inpName = document.getElementById('inp-name');
const teamBtns = document.querySelectorAll('.team-btn');
let chosenTeam = 1;
teamBtns.forEach(b => b.addEventListener('click', () => {
  chosenTeam = +b.dataset.team;
  teamBtns.forEach(x => x.classList.remove('primary'));
  b.classList.add('primary');
}));
document.getElementById('btn-join').addEventListener('click', () => {
  const name = inpName.value.trim() || ('Player' + Math.floor(Math.random()*999));
  socket.emit('join', {name, team: chosenTeam}, (res) => {
    if (res && res.ok) {
      isAdmin = !!res.isAdmin;
      goToCategories();
    } else {
      alert('Erro ao entrar');
    }
  });
});

// screen2 elements
const categoriesDiv = document.getElementById('categories');
const cats = ["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissões","alimentos","personagens","bíblico"];
// We'll use these keys as in words.json (normalized)
const catKeys = ["animals","tv_cinema","objects","places","people","sports_games","professions","foods","characters","biblical"];

function goToCategories() {
  show(screens.s2);
  renderScores();
  // render category buttons large
  categoriesDiv.innerHTML = '';
  catKeys.forEach((k, idx) => {
    const btn = document.createElement('button');
    btn.className = 'cat';
    btn.textContent = cats[idx];
    btn.onclick = () => {
      // ask server to choose category (admin-only on server)
      socket.emit('chooseCategory', {category: k}, (res) => {
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : 'somente admin pode escolher categoria');
        } else {
          // server will emit categoryChosen -> go to screen3
        }
      });
    };
    categoriesDiv.appendChild(btn);
  });
}

// screen3
const playersList = document.getElementById('players-list');
const btnCategories = document.getElementById('btn-categories');
btnCategories.addEventListener('click', () => {
  goToCategories();
});
document.getElementById('btn-cat-5')?.addEventListener('click', goToCategories);

// screen4a (chosen player controls)
const wordDisplay = document.getElementById('word-display');
const timer4a = document.getElementById('timer-4a');
const btnCorrect = document.getElementById('btn-correct');
const btnSkip = document.getElementById('btn-skip');
const btnExitRound = document.getElementById('btn-exit-round');
btnExitRound && btnExitRound.addEventListener('click', () => {
  // simply refresh to go back to join or categories
  window.location.reload();
});

// screen4b
const timer4b = document.getElementById('timer-4b');

// screen5
const listCorrect = document.getElementById('list-correct');
const listSkipped = document.getElementById('list-skipped');

// local client state
let clientId = null;
let isAdmin = false;
let myPlayerInfo = null;
let currentChosenId = null;
let currentCategory = null;
let currentWord = null;
let lastWord = null;

// beforeunload warning
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = 'Saindo irá desconectar. Tem certeza?';
});

// initial
show(screens.s1);

socket.on('connect', () => {
  clientId = socket.id;
});

// helper to render players in screen3
function renderPlayers(players) {
  playersList.innerHTML = '';
  players.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'player-btn';
    btn.textContent = `${p.name} — equipe ${p.team}` + (p.isAdmin ? ' (admin)' : '');
    btn.onclick = () => {
      // Admin selects player
      socket.emit('selectPlayer', {playerId: p.id}, (res) => {
        if (!res || !res.ok) {
          alert(res && res.error ? res.error : 'somente admin pode selecionar');
        }
      });
    };
    playersList.appendChild(btn);
  });
}

// socket events
socket.on('init', (data) => {
  // nothing immediate
});

socket.on('playersUpdate', (data) => {
  renderPlayers(data.players || []);
  renderScores(data.teams);
});

socket.on('categoryChosen', ({category, players, teams}) => {
  currentCategory = category;
  renderPlayers(players);
  renderScores(teams);
  show(screens.s3);
});

// when admin selects a player - server emits playerSelected with id
socket.on('playerSelected', ({playerId}) => {
  currentChosenId = playerId;
  renderPlayersForSelection(playerId);
});

// when round started for chosen player
socket.on('roundStartedChosen', ({word, time}) => {
  show(screens.s4a);
  currentWord = word;
  lastWord = word;
  wordDisplay.textContent = word || '...';
  timer4a.textContent = time;
  // show start controls
});

// when round started for others
socket.on('roundStartedOther', ({time}) => {
  show(screens.s4b);
  timer4b.textContent = time;
});

// timer update for all
socket.on('timer', ({time}) => {
  if (screens.s4a.classList.contains('active')) {
    timer4a.textContent = time;
  } else if (screens.s4b.classList.contains('active')) {
    timer4b.textContent = time;
  }
});

// teams update
socket.on('teamsUpdate', ({teams}) => {
  renderScores(teams);
});

// new word for chosen player
socket.on('newWord', ({word}) => {
  currentWord = word;
  lastWord = word;
  wordDisplay.textContent = word || '...';
});

// no more words
socket.on('noMoreWords', () => {
  wordDisplay.textContent = 'Sem mais palavras';
});

// skipping visual
socket.on('skipping', ({word}) => {
  wordDisplay.textContent = 'Pulando...';
});

// round end
socket.on('roundEnd', ({guessed, skipped, teams}) => {
  renderScores(teams);
  listCorrect.innerHTML = '';
  guessed.forEach(w => {
    const li = document.createElement('li'); li.textContent = w; li.style.color = 'lightgreen'; listCorrect.appendChild(li);
  });
  listSkipped.innerHTML = '';
  skipped.forEach(w => {
    const li = document.createElement('li'); li.textContent = w; li.style.color = '#ff6b6b'; listSkipped.appendChild(li);
  });
  show(screens.s5);
});

// server reset (admin left)
socket.on('serverReset', ({reason}) => {
  alert('Admin desconectou / página atualizada. Voltando para entrada.');
  window.location.reload();
});

// helper to render players and show the start button only for chosen
function renderPlayersForSelection(selectedId) {
  // reuse renderPlayers with special highlight
  playersList.innerHTML = '';
  socket.emit('getState', (st) => {
    (st.players || []).forEach(p => {
      const btn = document.createElement('div');
      btn.className = 'player-btn';
      btn.textContent = `${p.name} — equipe ${p.team}` + (p.isAdmin ? ' (admin)' : '');
      if (p.id === selectedId) {
        // add "Iniciar" button inside
        const startBtn = document.createElement('button');
        startBtn.textContent = 'INICIAR';
        startBtn.style.float = 'right';
        startBtn.className = 'primary';
        startBtn.onclick = () => {
          // If I am the chosen player, call startRound
          if (socket.id === p.id) {
            socket.emit('startRound', (res) => {
              if (!res || !res.ok) {
                alert(res && res.error ? res.error : 'Não foi possível iniciar');
              }
            });
          } else {
            alert('Somente o player escolhido pode iniciar');
          }
        };
        btn.appendChild(startBtn);
      }
      playersList.appendChild(btn);
    });
  });
}

// Correct/Skip buttons handlers
btnCorrect && btnCorrect.addEventListener('click', () => {
  if (!currentWord) return;
  // send the word to server to register
  socket.emit('correctWord', {word: currentWord}, (res) => {
    if (!res || !res.ok) {
      alert(res && res.error ? res.error : 'Erro ao marcar acerto');
    }
  });
});

btnSkip && btnSkip.addEventListener('click', () => {
  if (!currentWord) return;
  socket.emit('skipWord', {word: currentWord}, (res) => {
    if (!res || !res.ok) {
      alert(res && res.error ? res.error : 'Erro ao pular');
    }
  });
});

// utility to render scores in multiple places
function renderScores(teams) {
  teams = teams || {1:0,2:0};
  document.getElementById('score1').textContent = teams[1] || 0;
  document.getElementById('score2').textContent = teams[2] || 0;
  // screens that show summary
  document.getElementById('score-3').textContent = `Equipe 1: ${teams[1]||0} — Equipe 2: ${teams[2]||0}`;
  document.getElementById('score-5').textContent = `Equipe 1: ${teams[1]||0} — Equipe 2: ${teams[2]||0}`;
}

// when clicking 'Categorias' from screens
document.getElementById('btn-cat-5').addEventListener('click', goToCategories);
document.getElementById('back-to-join').addEventListener('click', () => {
  if (confirm('Sair desconectará. Deseja mesmo sair?')) window.location.reload();
});

// receive players update initial
socket.on('playersUpdate', ({players}) => {
  // detect my player info
  const me = (players || []).find(p => p.id === socket.id);
  if (me) myPlayerInfo = me;
});

// on initial categoryChosen, go to screen3 (handled above). Also, if admin selected player show selection view
// fallbacks: if server emits nothing but user wants categories from screen2 -> we already request chooseCategory when click.

