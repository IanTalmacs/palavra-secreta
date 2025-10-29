const socket = io();

// screens
const S1 = document.getElementById('screen-1');
const S2 = document.getElementById('screen-2');
const S3 = document.getElementById('screen-3');
const S4 = document.getElementById('screen-4');
const S5 = document.getElementById('screen-5');
const S6 = document.getElementById('screen-6');

const nameInput = document.getElementById('nameInput');
const confirmName = document.getElementById('confirmName');
const categoriesBtn = document.getElementById('categoriesBtn');

const lobbyList = document.getElementById('lobbyList');
const team1List = document.getElementById('team1List');
const team2List = document.getElementById('team2List');
const categoriesGrid = document.getElementById('categoriesGrid');

const prepareText = document.getElementById('prepareText');
const startBtnWrap = document.getElementById('startBtnWrap');

const timerEl = document.getElementById('timer');
const wordText = document.getElementById('wordText');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const skipOverlay = document.getElementById('skipOverlay');

const resultsList = document.getElementById('resultsList');
const advanceBtn = document.getElementById('advanceBtn');

const scoresRow = document.getElementById('scoresRow');

let myId = null;
let myIsAdmin = false;
let currentPlayerId = null;
let currentCategory = null;
let currentTeam = null;
let lastWord = null;

function showScreen(n) {
  [S1,S2,S3,S4,S5,S6].forEach(s => s.classList.add('hidden'));
  n.classList.remove('hidden');
}

showScreen(S1);

// beforeunload warning
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

// join flow
confirmName.addEventListener('click', () => {
  const rawName = nameInput.value.trim();
  if (!rawName) return alert('Digite um nome');
  socket.emit('join', { rawName });
  // go to lobby screen (wait server broadcast to show actual lists)
  showScreen(S2);
  nameInput.value = '';
});

// drag-and-drop helpers
function makePlayerLi(p) {
  const li = document.createElement('li');
  li.textContent = p.name + (p.isAdmin ? ' (Admin)' : '');
  li.draggable = true;
  li.dataset.id = p.id;
  li.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', p.id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', e => {
    li.classList.remove('dragging');
  });
  // small remove button for admin (optional)
  return li;
}

function renderLists(state) {
  // clear
  lobbyList.innerHTML = '';
  team1List.innerHTML = '';
  team2List.innerHTML = '';

  (state.teams.lobby || state.lobby || []).forEach(p => {
    const li = makePlayerLi(p);
    lobbyList.appendChild(li);
  });
  (state.teams.team1 || []).forEach(p => {
    const li = makePlayerLi(p);
    team1List.appendChild(li);
  });
  (state.teams.team2 || []).forEach(p => {
    const li = makePlayerLi(p);
    team2List.appendChild(li);
  });

  // drop handlers
  [lobbyList, team1List, team2List].forEach(el => {
    el.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      let dest = 'lobby';
      if (el === team1List) dest = 'team1';
      if (el === team2List) dest = 'team2';
      socket.emit('movePlayer', { playerId: id, dest });
    });
  });

  // update scores
  scoresRow.innerHTML = `Placar — Equipe 1: ${state.scores.team1} • Equipe 2: ${state.scores.team2}`;
}

// show categories
categoriesBtn.addEventListener('click', () => {
  // only admin should be able to trigger categories; server will validate too.
  socket.emit('requestLobby');
  // ask server to send categories? We'll just navigate to categories screen and wait for server 'categories' or 'lobbyState'
  showScreen(S3);
});

// render categories list when server sends
socket.on('categories', ({ categories }) => {
  categoriesGrid.innerHTML = '';
  categories.forEach(cat => {
    const b = document.createElement('button');
    b.textContent = cat;
    b.onclick = () => {
      socket.emit('selectCategory', { category: cat });
      // wait server to broadcast next steps...
    };
    categoriesGrid.appendChild(b);
  });
});

// initial lobby state
socket.on('lobbyState', (payload) => {
  myId = socket.id;
  // detect if I am admin in players list (if present)
  const me = (payload.players || []).find(p => p.id === myId);
  myIsAdmin = me ? me.isAdmin : false;
  // render lists
  renderLists(payload);
});

// when server informs category selected, we move to prepare screen
socket.on('categorySelected', ({ category, categories }) => {
  currentCategory = category;
  // show screen 4 (prepare) — server will send preparePlayer with player to prepare
  showScreen(S4);
  // update category grid (so selected categories removed on other clients)
  socket.emit('requestLobby');
});

// prepare message (server chooses player)
socket.on('preparePlayer', ({ playerId, name, team }) => {
  currentPlayerId = playerId;
  currentTeam = team;
  prepareText.textContent = `Preparar ${name}`;
  // show screen 4
  showScreen(S4);

  // if i'm the chosen player, show 'iniciar'
  startBtnWrap.innerHTML = '';
  if (myId === playerId) {
    const btn = document.createElement('button');
    btn.textContent = 'Iniciar';
    btn.className = 'primary';
    btn.onclick = () => {
      socket.emit('startTurn');
    };
    startBtnWrap.appendChild(btn);
  } else {
    startBtnWrap.innerHTML = '<small>Aguardando o jogador iniciar...</small>';
  }
});

// when turn started (server)
socket.on('turnStarted', ({ playerId, word, team }) => {
  // navigate everyone to screen 5. But only chosen player sees word and buttons.
  showScreen(S5);
  timerEl.textContent = '75';
  if (myId === playerId) {
    wordText.textContent = word || '---';
    lastWord = word;
    document.getElementById('actionBtns').style.display = 'flex';
    skipOverlay.classList.add('hidden');
  } else {
    // spectators see only timer and no word
    wordText.textContent = '';
    document.getElementById('actionBtns').style.display = 'none';
  }
});

// ticks
socket.on('tick', ({ remaining }) => {
  timerEl.textContent = String(remaining);
  if (remaining <= 5) {
    // hide skip for everyone to avoid confusion
    if (skipBtn) skipBtn.style.display = 'none';
  } else {
    if (skipBtn) skipBtn.style.display = 'inline-block';
  }
});

// hide skip instruction from server
socket.on('hideSkip', () => {
  if (skipBtn) skipBtn.style.display = 'none';
});

// word update (server sends next word)
socket.on('wordUpdate', ({ word, scores }) => {
  if (scores) {
    scoresRow.innerHTML = `Placar — Equipe 1: ${scores.team1} • Equipe 2: ${scores.team2}`;
  }
  if (myId === currentPlayerId) {
    wordText.textContent = word || '---';
    lastWord = word;
    skipOverlay.classList.add('hidden');
    document.getElementById('actionBtns').style.display = 'flex';
  }
});

// skipping (server asks player to show pulando...)
socket.on('skipping', () => {
  if (myId === currentPlayerId) {
    skipOverlay.classList.remove('hidden');
    document.getElementById('actionBtns').style.display = 'none';
    wordText.textContent = '';
  }
});

// roundEnd
socket.on('roundEnd', ({ words, team, scores }) => {
  // show screen 6 with words list
  showScreen(S6);
  resultsList.innerHTML = '';
  words.forEach(w => {
    const div = document.createElement('div');
    div.className = 'resultItem ' + (w.status === 'ok' ? 'ok' : 'skipped');
    div.textContent = w.word + (w.status === 'ok' ? ' — ACERTOU' : ' — PULADO');
    resultsList.appendChild(div);
  });
  scoresRow.innerHTML = `Placar — Equipe 1: ${scores.team1} • Equipe 2: ${scores.team2}`;
});

// categories removed and updated
socket.on('categorySelected', (data) => {
  // server already sent event; we wait prepare...
});

// reset -> go back to screen1
socket.on('reset', () => {
  showScreen(S1);
  alert('Jogo reiniciado pelo Admin. Volte a entrar.');
});

// lobbyState may be emitted to update lists and categories
socket.on('lobbyState', (payload) => {
  // render lists and update categories grid if visible
  renderLists(payload);
  if (payload.categories && payload.categories.length >= 0) {
    categoriesGrid.innerHTML = '';
    payload.categories.forEach(cat => {
      const b = document.createElement('button');
      b.textContent = cat;
      b.onclick = () => {
        socket.emit('selectCategory', { category: cat });
      };
      categoriesGrid.appendChild(b);
    });
  }
});

// clicking 'acertou' or 'pular' will send lastWord to server
correctBtn.addEventListener('click', () => {
  if (!lastWord) return;
  socket.emit('gotIt', { word: lastWord });
});

skipBtn.addEventListener('click', () => {
  if (!lastWord) return;
  socket.emit('skipWord', { word: lastWord });
});

// Admin advance button
advanceBtn.addEventListener('click', () => {
  socket.emit('adminAdvance');
});

// helper: when lobbyState arrives show categories button only for admin
socket.on('lobbyState', (payload) => {
  const me = (payload.players || []).find(p => p.id === myId);
  myIsAdmin = me ? me.isAdmin : false;
  if (!myIsAdmin) {
    categoriesBtn.style.display = 'none';
    advanceBtn.style.display = 'none';
  } else {
    categoriesBtn.style.display = 'inline-block';
    advanceBtn.style.display = 'inline-block';
  }
});
