const socket = io();

// UI helpers
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

// Screens
const screens = {
  1: qs('#screen-1'),
  2: qs('#screen-2'),
  3: qs('#screen-3'),
  4: qs('#screen-4'),
  '5a': qs('#screen-5a'),
  '5b': qs('#screen-5b'),
  6: qs('#screen-6')
};

let myId = null;
let amIAdmin = false;
let myName = '';
let currentScreen = 1;
let serverState = null;
let roundTimerInterval = null;

// before unload warning
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

// show only one screen
function showScreen(num) {
  // special handling for 5a/5b
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  if (num === 5) {
    // decide by role
    if (amIAdmin) {
      // admin is not player-specific; if admin is also the active player they'd see 5a
      // we'll rely on server events to switch to 5a/5b for players
    }
    // do nothing here
  } else if (num === 5.1) {
    screens['5a'].classList.remove('hidden');
  } else if (num === 5.2) {
    screens['5b'].classList.remove('hidden');
  } else {
    const el = screens[num];
    if (el) el.classList.remove('hidden');
  }
}

// initial bindings
qs('#confirm-name').addEventListener('click', () => {
  const name = qs('#name-input').value.trim();
  if (!name) return alert('Digite um nome');
  myName = name;
  socket.emit('join', name);
});

// Admin next buttons
qs('#admin-next')?.addEventListener('click', () => socket.emit('admin-next-screen'));
qs('#admin-next-3')?.addEventListener('click', () => socket.emit('admin-next-screen'));
qs('#admin-next-4')?.addEventListener('click', () => socket.emit('admin-next-screen'));
qs('#admin-next-6')?.addEventListener('click', () => socket.emit('admin-next-screen'));

// categories modal
qs('#btn-categories')?.addEventListener('click', () => qs('#categories-modal').classList.remove('hidden'));
qs('#btn-categories-6')?.addEventListener('click', () => qs('#categories-modal').classList.remove('hidden'));
qs('#save-categories')?.addEventListener('click', () => {
  const boxes = Array.from(document.querySelectorAll('.cat-checkbox')).filter(i=>i.checked).map(i=>i.value);
  socket.emit('select-categories', { categories: boxes });
  qs('#categories-modal').classList.add('hidden');
});

// drag/drop (only admin allowed to drag)
function enableDragForCard(card) {
  card.setAttribute('draggable', true);
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });
}

['#lobby','#team1','#team2'].forEach(sel => {
  const el = qs(sel);
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const target = sel === '#team1' ? 'team1' : sel === '#team2' ? 'team2' : 'lobby';
    socket.emit('move-player', { playerId: id, to: target });
  });
});

// SCREEN 4: admin selects player
function renderSelectablePlayers(players) {
  const list1 = qs('#list-team1');
  const list2 = qs('#list-team2');
  list1.innerHTML = '';
  list2.innerHTML = '';
  players.filter(p=>p.team==='team1').forEach(p => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.textContent = p.displayName;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = 'Escolher';
    btn.addEventListener('click', () => socket.emit('admin-select-player', { playerId: p.id }));
    div.appendChild(btn);
    list1.appendChild(div);
  });
  players.filter(p=>p.team==='team2').forEach(p => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.textContent = p.displayName;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = 'Escolher';
    btn.addEventListener('click', () => socket.emit('admin-select-player', { playerId: p.id }));
    div.appendChild(btn);
    list2.appendChild(div);
  });
}

// Round controls for active player
qs('#btn-acertou')?.addEventListener('click', () => socket.emit('round-acertou'));
qs('#btn-pular')?.addEventListener('click', () => socket.emit('round-pular'));

// handle server events
socket.on('init-state', (st) => {
  serverState = st;
  myId = socket.id;
  // detect whether this client is admin by checking its name in players? server included isAdmin flags only via init state for this client
  // better: when joined, server didn't confirm; we rely on local name matching: if name contains 999 => admin
  amIAdmin = (myName && myName.includes('999'));
  updateUIFromState(st);
});

socket.on('players-updated', (st) => {
  serverState = st;
  updateUIFromState(st);
});

socket.on('screen-changed', ({ screen }) => {
  currentScreen = screen;
  if (screen === 1) showScreen(1);
  else if (screen === 2) showScreen(2);
  else if (screen === 3) showScreen(3);
  else if (screen === 4) showScreen(4);
  else if (screen === 6) showScreen(6);
});

socket.on('active-player-selected', ({ playerId }) => {
  // show small UI cue (for admin or others)
  // if me is the active player, show start button in screen 4 area
  if (playerId === socket.id) {
    // show start button
    const btn = document.createElement('button');
    btn.className = 'btn large';
    btn.textContent = 'Iniciar';
    btn.addEventListener('click', () => socket.emit('player-start-round'));
    const container = document.getElementById('list-team1').parentElement;
    // remove old start buttons
    qsa('.start-button-placeholder').forEach(n=>n.remove());
    const placeholder = document.createElement('div');
    placeholder.className = 'start-button-placeholder';
    placeholder.appendChild(btn);
    // append to screen 4 bottom
    qs('#screen-4 .bottombar').appendChild(placeholder);
  } else {
    // remove start button if present
    qsa('.start-button-placeholder').forEach(n=>n.remove());
  }
});

socket.on('round-started', ({ activePlayerId, endTime, currentWord }) => {
  // who sees what?
  if (socket.id === activePlayerId) {
    showScreen(5.1);
    showWordForActive(currentWord);
  } else {
    showScreen(5.2);
  }
  // start countdown timer to endTime
  startCountdown(endTime);
});

socket.on('round-update', ({ action, nextWord, scores, correct, skipped }) => {
  // update scoreboard
  updateScores(scores);
  // if action pular -> show pulando
  if (action === 'pular') {
    // active player will handle pulando UI via round-resume
    if (!qs('#puling').classList.contains('hidden')) {
      // already pulando
    }
  }
});

socket.on('round-resume', ({ nextWord }) => {
  // hide pulando and show next word for active player
  qs('#puling')?.classList.add('hidden');
  qs('#word-display').textContent = nextWord || '—';
});

socket.on('hide-skip', () => {
  const btn = qs('#btn-pular');
  if (btn) btn.style.display = 'none';
});

socket.on('round-ended', (roundData) => {
  // show results screen 6
  showScreen(6);
  updateScores(roundData.scores);
  const corr = qs('#correct-list');
  const sk = qs('#skipped-list');
  corr.innerHTML = '';
  sk.innerHTML = '';
  (roundData.correct||[]).forEach(w => { const d = document.createElement('div'); d.className='correct-item'; d.textContent = w; corr.appendChild(d); });
  (roundData.skipped||[]).forEach(w => { const d = document.createElement('div'); d.className='skipped-item'; d.textContent = w; sk.appendChild(d); });
});

socket.on('reset-to-screen-1', () => {
  // reset local view
  currentScreen = 1;
  showScreen(1);
  // clear local name so user must rejoin
  // (don't auto-clear input to help testing)
});

socket.on('categories-updated', ({ categories }) => {
  renderCategoriesCheckboxes(categories);
});

// utility functions
function updateUIFromState(st) {
  // scoreboard
  updateScores(st.scores || { team1:0, team2:0 });
  // players lists
  renderPlayers(st.players || []);

  // categories
  renderCategories(st.categories || []);

  // screens
  // show st.screen but screen 5 is controlled by round events
  if (st.screen === 1) showScreen(1);
  else if (st.screen === 2) showScreen(2);
  else if (st.screen === 3) showScreen(3);
  else if (st.screen === 4) showScreen(4);
  else if (st.screen === 6) showScreen(6);

  // render selectable players on screen 4
  renderSelectablePlayers(st.players || []);
}

function updateScores(scores) {
  qs('#score-team1').textContent = scores.team1 || 0;
  qs('#score-team2').textContent = scores.team2 || 0;
  qs('#s3-score-team1').textContent = scores.team1 || 0;
  qs('#s3-score-team2').textContent = scores.team2 || 0;
  qs('#s4-score-team1').textContent = scores.team1 || 0;
  qs('#s4-score-team2').textContent = scores.team2 || 0;
  qs('#s6-score-team1').textContent = scores.team1 || 0;
  qs('#s6-score-team2').textContent = scores.team2 || 0;
}

function renderPlayers(players) {
  // players is array with {id, displayName, team, isAdmin}
  const lobby = qs('#lobby');
  const t1 = qs('#team1');
  const t2 = qs('#team2');
  lobby.innerHTML=''; t1.innerHTML=''; t2.innerHTML='';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.id = p.id;
    const left = document.createElement('div');
    left.className = 'player-name';
    left.textContent = p.displayName;
    card.appendChild(left);
    if (p.isAdmin) {
      const tiny = document.createElement('div');
      tiny.className = 'player-admin'; tiny.textContent='Admin'; card.appendChild(tiny);
    }
    if (amIAdmin) {
      enableDragForCard(card);
    }

    if (p.team === 'lobby') lobby.appendChild(card);
    else if (p.team === 'team1') t1.appendChild(card);
    else if (p.team === 'team2') t2.appendChild(card);
  });
}

function renderCategories(selected) {
  const grid = qs('.categories-grid');
  grid.innerHTML = '';
  // categories list hard-coded to match server
  const cats = [
    'animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissões','alimentos','personagens','bíblico'
  ];
  cats.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category';
    div.textContent = cat;
    grid.appendChild(div);
  });
  // build modal checkbox list
  renderCategoriesCheckboxes(selected || cats);
}

function renderCategoriesCheckboxes(selected) {
  const box = qs('#categories-checkboxes');
  if (!box) return;
  box.innerHTML = '';
  const cats = [
    'animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissões','alimentos','personagens','bíblico'
  ];
  cats.forEach(c => {
    const row = document.createElement('label');
    row.className = 'categories-checkbox';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value=c; cb.checked = (selected||[]).includes(c); cb.className='cat-checkbox';
    const span = document.createElement('span'); span.textContent = ' ' + c;
    row.appendChild(cb); row.appendChild(span);
    box.appendChild(row);
  });
}

function showWordForActive(word) {
  qs('#puling').classList.add('hidden');
  qs('#word-display').textContent = word || '—';
}

function startCountdown(endTime) {
  if (roundTimerInterval) clearInterval(roundTimerInterval);
  function tick() {
    const remain = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    qsa('#round-time,#round-time-b').forEach(el=>el.textContent = remain);
    if (remain <= 0) {
      clearInterval(roundTimerInterval);
    }
  }
  tick();
  roundTimerInterval = setInterval(tick, 250);
}

// initial screen
showScreen(1);