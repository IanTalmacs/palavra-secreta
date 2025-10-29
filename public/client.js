// /public/client.js
const socket = io();

// UI elements
const topbar = document.querySelector('.topbar');
const screen1 = document.getElementById('screen-1');
const screen2 = document.getElementById('screen-2');
const screen4 = document.getElementById('screen-4');
const screen5a = document.getElementById('screen-5a');
const screen5b = document.getElementById('screen-5b');
const screen6 = document.getElementById('screen-6');

const nameInput = document.getElementById('name-input');
const confirmNameBtn = document.getElementById('confirm-name');

const lobbyEl = document.getElementById('lobby');
const team1El = document.getElementById('team1');
const team2El = document.getElementById('team2');

const playersList = document.getElementById('players-list');

const btnCategorias = document.getElementById('btn-categorias');
const modalCategories = document.getElementById('modal-categories');
const categoriesList = document.getElementById('categories-list');
const closeCategories = document.getElementById('close-categories');
const saveCategories = document.getElementById('save-categories');

const scoreTeam1 = document.getElementById('score-team1');
const scoreTeam2 = document.getElementById('score-team2');

const btnCategorias2 = document.getElementById('btn-categorias-2');
const btnAdminNext = document.getElementById('btn-admin-next');

const playersContainer = document.getElementById('players-list');

const roundTime = document.getElementById('round-time');
const roundTime2 = document.getElementById('round-time-2');
const wordArea = document.getElementById('word-area');
const skipText = document.getElementById('skip-text');
const btnCorrect = document.getElementById('btn-correct');
const btnSkip = document.getElementById('btn-skip');

const resultsList = document.getElementById('results-list');

let me = { id: null, isAdmin: false, displayName: null };
let state = null;
let endTime = null;
let rafTimer = null;
let localSelectedCategories = [];

// floating "Iniciar" button (visible only to the selected player on screen 4)
const floatingStart = document.createElement('button');
floatingStart.className = 'btn large';
floatingStart.textContent = 'Iniciar';
floatingStart.style.position = 'fixed';
floatingStart.style.bottom = '18px';
floatingStart.style.left = '50%';
floatingStart.style.transform = 'translateX(-50%)';
floatingStart.style.zIndex = '50';
floatingStart.style.display = 'none';
floatingStart.addEventListener('click', () => {
  socket.emit('startRound');
});
document.body.appendChild(floatingStart);

// utility: escape
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}

// show/hide screens - ensures scoreboard/topbar hidden on screen 1
function showScreen(n) {
  [screen1, screen2, screen4, screen5a, screen5b, screen6].forEach(s => s.classList.add('hidden'));

  // hide modal by default unless opened explicitly
  modalCategories.classList.add('hidden');

  // hide floating start by default (will be toggled by state handler)
  floatingStart.style.display = 'none';

  // show only requested screen
  if (n === 1) {
    screen1.classList.remove('hidden');
    // hide topbar/placar on screen 1
    if (topbar) topbar.classList.add('hidden');
  } else {
    // show topbar (placar visible in all screens except 1)
    if (topbar) topbar.classList.remove('hidden');
    if (n === 2) screen2.classList.remove('hidden');       // Lobby / Teams
    if (n === 4) screen4.classList.remove('hidden');       // Selection list
    if (n === '5a') screen5a.classList.remove('hidden');   // Active player
    if (n === '5b') screen5b.classList.remove('hidden');   // Spectators
    if (n === 6) screen6.classList.remove('hidden');       // Results
  }
}

// initial show only screen 1 (name input)
showScreen(1);

// beforeunload warning (keeps behavior requested)
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

// JOIN
confirmNameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return alert('Digite seu nome');
  socket.emit('join', name, (res) => {
    if (!res || !res.ok) return alert('Erro ao entrar');
    me.id = res.playerId;
    me.isAdmin = !!res.isAdmin;
    // server will broadcast state and app will advance as appropriate
  });
});

// Categories modal open/close/save
btnCategorias.addEventListener('click', () => {
  if (!state) return;
  renderCategoriesModal(state.categoriesAvailable || [], state.categoriesSelected || []);
});
btnCategorias2.addEventListener('click', () => {
  if (!state) return;
  renderCategoriesModal(state.categoriesAvailable || [], state.categoriesSelected || []);
});
closeCategories.addEventListener('click', () => modalCategories.classList.add('hidden'));
saveCategories.addEventListener('click', () => {
  if (!me.isAdmin) {
    modalCategories.classList.add('hidden');
    return;
  }
  const checks = Array.from(categoriesList.querySelectorAll('input[type=checkbox]'));
  const chosen = checks.filter(c => c.checked).map(c => c.value);
  socket.emit('setCategories', chosen);
  modalCategories.classList.add('hidden');
});

// admin next button on results
btnAdminNext.addEventListener('click', () => {
  if (!me.isAdmin) return;
  socket.emit('endResultsNext');
});

// player actions during round (only active player can trigger; server enforces)
btnCorrect.addEventListener('click', () => socket.emit('correct'));
btnSkip.addEventListener('click', () => socket.emit('skip'));

// drag & drop helpers for admin
function makeDraggable(el, playerId) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', playerId);
  });
}
[lobbyEl, team1El, team2El].forEach(container => {
  container.addEventListener('dragover', (e) => e.preventDefault());
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('text/plain');
    let team = 'lobby';
    if (container.id === 'team1') team = 'team1';
    if (container.id === 'team2') team = 'team2';
    socket.emit('movePlayer', { playerId, team });
  });
});

// render players lists (lobby / equipes) and selection list
function renderPlayersLists(players) {
  lobbyEl.innerHTML = '';
  team1El.innerHTML = '';
  team2El.innerHTML = '';

  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player' + (p.isAdmin ? ' admin' : '');
    el.innerHTML = `<div class="name">${escapeHtml(p.displayName)}</div>`;
    if (me.isAdmin) makeDraggable(el, p.id);
    else el.setAttribute('draggable', 'false');

    if (p.team === 'lobby') lobbyEl.appendChild(el);
    else if (p.team === 'team1') team1El.appendChild(el);
    else if (p.team === 'team2') team2El.appendChild(el);
  });

  // selection list (screen 4)
  playersContainer.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = `<div>${escapeHtml(p.displayName)}</div><div class="badge">${p.team === 'team1' ? 'Equipe 1' : p.team === 'team2' ? 'Equipe 2' : 'Lobby'}</div>`;
    el.addEventListener('click', () => {
      if (!me.isAdmin) return;
      socket.emit('selectPlayer', p.id);
    });
    // highlight selected player
    if (state && state.selectedPlayerId === p.id) {
      el.style.outline = '2px solid rgba(29,185,84,0.18)';
    }
    playersContainer.appendChild(el);
  });
}

function renderScores(scoresObj) {
  scoreTeam1.textContent = scoresObj.team1 || 0;
  scoreTeam2.textContent = scoresObj.team2 || 0;
}

function renderCategoriesModal(allCats, selectedCats) {
  categoriesList.innerHTML = '';
  allCats.forEach(c => {
    const row = document.createElement('div');
    row.className = 'category-row';
    const id = 'cat-' + c.replace(/\s+/g,'-');
    row.innerHTML = `
      <input type="checkbox" id="${id}" value="${c}" ${selectedCats.includes(c) ? 'checked' : ''} ${me.isAdmin ? '' : 'disabled'}>
      <label for="${id}">${escapeHtml(c)}</label>
    `;
    categoriesList.appendChild(row);
  });
  modalCategories.classList.remove('hidden');
}

// countdown helpers
function startCountdownLoop() {
  if (rafTimer) return;
  function tick() {
    if (!endTime) { stopCountdownLoop(); return; }
    const ms = Math.max(0, endTime - Date.now());
    const sec = Math.ceil(ms / 1000);
    if (!screen5a.classList.contains('hidden')) {
      roundTime.textContent = String(sec);
      if (ms <= 5000) btnSkip.style.display = 'none';
      else btnSkip.style.display = '';
    }
    if (!screen5b.classList.contains('hidden')) {
      roundTime2.textContent = String(sec);
    }
    rafTimer = requestAnimationFrame(tick);
  }
  rafTimer = requestAnimationFrame(tick);
}
function stopCountdownLoop() {
  if (rafTimer) cancelAnimationFrame(rafTimer);
  rafTimer = null;
}

// SOCKET: state updates (main single handler)
socket.on('state', (s) => {
  state = s;
  renderScores(s.scores || { team1:0, team2:0 });
  renderPlayersLists(s.players || []);

  // default UI flow rules:
  // - If there's no admin on server -> only screen 1 (name input)
  const adminExists = (s.players || []).some(p => p.isAdmin);
  if (!adminExists) {
    showScreen(1);
    return;
  }

  // set me info if present in list
  const mePlayer = (s.players || []).find(p => p.id === me.id);
  if (mePlayer) {
    me.displayName = mePlayer.displayName;
    me.isAdmin = mePlayer.isAdmin;
  }

  // decide which main screen to show:
  // priority: active round -> show 5a/5b
  if (s.roundActive && s.roundInfo) {
    endTime = s.roundInfo.endTime;
    if (s.roundInfo.currentPlayerId === me.id) {
      showScreen('5a');
    } else {
      showScreen('5b');
    }
  } else {
    // no active round
    if (s.selectedPlayerId) {
      // selection stage (screen 4)
      showScreen(4);
    } else {
      // default lobby/teams (screen 2)
      // show lobby only when the client already joined
      if (me.id) showScreen(2);
      else showScreen(1);
    }
  }

  // handle word display / skipping area for active player
  if (s.roundActive && s.roundInfo) {
    if (s.roundInfo.currentWord) {
      wordArea.textContent = s.roundInfo.currentWord;
      wordArea.classList.remove('hidden');
      skipText.classList.add('hidden');
    } else {
      wordArea.textContent = '';
      if (s.roundInfo.skipUntil && Date.now() < s.roundInfo.skipUntil) {
        skipText.classList.remove('hidden');
        wordArea.classList.add('hidden');
      } else {
        skipText.classList.add('hidden');
        wordArea.classList.remove('hidden');
      }
    }
    // hide skip when <=5 sec
    const remainingMs = Math.max(0, (s.roundInfo.endTime || 0) - Date.now());
    if (remainingMs <= 5000) btnSkip.style.display = 'none';
    else btnSkip.style.display = '';
  } else {
    // round not active -> clear word UI
    wordArea.textContent = '';
    skipText.classList.add('hidden');
    btnSkip.style.display = '';
    endTime = null;
  }

  // results list (for screen 6)
  resultsList.innerHTML = '';
  if (s.roundInfo && Array.isArray(s.roundInfo.wordHistory)) {
    s.roundInfo.wordHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-item ' + (entry.status === 'correct' ? 'correct' : 'skipped');
      div.innerHTML = `<div>${escapeHtml(entry.word)}</div><div>${entry.status === 'correct' ? '+' : '-'}</div>`;
      resultsList.appendChild(div);
    });
  }

  // Floating "Iniciar" button visibility:
  // - only visible if: I'm the selected player, there is no active round, and current screen is selection (4)
  if (s.selectedPlayerId === me.id && !s.roundActive && !screen1.classList.contains('hidden') === false) {
    // ensure we are not on screen1
  }
  if (s.selectedPlayerId === me.id && !s.roundActive && !screen4.classList.contains('hidden')) {
    floatingStart.style.display = '';
  } else {
    floatingStart.style.display = 'none';
  }

  // categories modal state not auto-opened by state; it opens only when user clicks the button.

  // update countdown loop
  if (s.roundActive && s.roundInfo) {
    startCountdownLoop();
  } else {
    stopCountdownLoop();
  }
});

// Round started/ended events from server
socket.on('roundStarted', (info) => {
  endTime = info.endTime;
  // state event will handle screen switching
});
socket.on('roundEnded', (res) => {
  // show results screen
  showScreen(6);
  stopCountdownLoop();
  if (res && res.wordHistory) {
    resultsList.innerHTML = '';
    res.wordHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-item ' + (entry.status === 'correct' ? 'correct' : 'skipped');
      div.innerHTML = `<div>${escapeHtml(entry.word)}</div><div>${entry.status === 'correct' ? '+' : '-'}</div>`;
      resultsList.appendChild(div);
    });
  }
});

// forced reset: admin left
socket.on('forceReset', () => {
  me = { id: null, isAdmin: false, displayName: null };
  state = null;
  endTime = null;
  stopCountdownLoop();
  lobbyEl.innerHTML = '';
  team1El.innerHTML = '';
  team2El.innerHTML = '';
  resultsList.innerHTML = '';
  nameInput.value = '';
  showScreen(1);
});
