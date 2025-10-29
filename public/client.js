const socket = io();

// UI elements
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

function showScreen(n) {
  // hide all screens
  [screen1, screen2, screen4, screen5a, screen5b, screen6].forEach(s => s.classList.add('hidden'));
  if (n === 1) screen1.classList.remove('hidden');
  if (n === 2) screen2.classList.remove('hidden');
  if (n === 4) screen4.classList.remove('hidden');
  if (n === '5a') screen5a.classList.remove('hidden');
  if (n === '5b') screen5b.classList.remove('hidden');
  if (n === 6) screen6.classList.remove('hidden');
}

function enableBeforeUnloadPrompt() {
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });
}

// initial
showScreen(1);
enableBeforeUnloadPrompt();

// confirm name
confirmNameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return alert('Digite seu nome');
  socket.emit('join', name, (res) => {
    if (!res || !res.ok) return alert('Erro ao entrar');
    me.id = res.playerId;
    me.isAdmin = !!res.isAdmin;
    // After join, advance to screen 2 if admin exists on server.
    // Server will send state which will set UI accordingly.
  });
});

btnCategorias.addEventListener('click', () => {
  openCategoriesModal();
});
btnCategorias2.addEventListener('click', () => {
  openCategoriesModal();
});
closeCategories.addEventListener('click', () => {
  modalCategories.classList.add('hidden');
});
saveCategories.addEventListener('click', () => {
  // only admin can save
  if (!me.isAdmin) {
    modalCategories.classList.add('hidden');
    return;
  }
  const checks = Array.from(categoriesList.querySelectorAll('input[type=checkbox]'));
  const chosen = checks.filter(c => c.checked).map(c => c.value);
  socket.emit('setCategories', chosen);
  modalCategories.classList.add('hidden');
});

btnAdminNext.addEventListener('click', () => {
  if (!me.isAdmin) return;
  socket.emit('endResultsNext');
});

// player actions
btnCorrect.addEventListener('click', () => {
  socket.emit('correct');
});
btnSkip.addEventListener('click', () => {
  socket.emit('skip');
});

// drag & drop helpers
function makeDraggable(el, playerId) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', playerId);
  });
}

[lobbyEl, team1El, team2El].forEach(container => {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const playerId = e.dataTransfer.getData('text/plain');
    let team = 'lobby';
    if (container.id === 'team1') team = 'team1';
    if (container.id === 'team2') team = 'team2';
    socket.emit('movePlayer', { playerId, team });
  });
});

// render functions
function renderPlayersLists(players) {
  lobbyEl.innerHTML = '';
  team1El.innerHTML = '';
  team2El.innerHTML = '';

  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player' + (p.isAdmin ? ' admin' : '');
    el.innerHTML = `<div class="name">${escapeHtml(p.displayName)}</div>`;
    // admin can drag
    if (me.isAdmin) {
      makeDraggable(el, p.id);
    } else {
      el.setAttribute('draggable', 'false');
    }
    if (p.team === 'lobby') lobbyEl.appendChild(el);
    else if (p.team === 'team1') team1El.appendChild(el);
    else if (p.team === 'team2') team2El.appendChild(el);
  });

  // render players list for selection (screen 4)
  playersContainer.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = `<div>${escapeHtml(p.displayName)}</div><div class="badge">${p.team === 'team1' ? 'Equipe 1' : p.team === 'team2' ? 'Equipe 2' : 'Lobby'}</div>`;
    el.addEventListener('click', () => {
      // admin selects a player
      if (!me.isAdmin) return;
      socket.emit('selectPlayer', p.id);
    });
    // highlight selected
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

function renderCategories(allCats, selectedCats) {
  categoriesList.innerHTML = '';
  allCats.forEach(c => {
    const row = document.createElement('div');
    row.className = 'category-row';
    const id = 'cat-' + c;
    row.innerHTML = `
      <input type="checkbox" id="${id}" value="${c}" ${selectedCats.includes(c) ? 'checked' : ''} ${me.isAdmin ? '' : 'disabled'}>
      <label for="${id}">${escapeHtml(c)}</label>
    `;
    categoriesList.appendChild(row);
  });
  modalCategories.classList.remove('hidden');
}

// utilities
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}

// handle server state update
socket.on('state', (s) => {
  state = s;
  // if server cleared players (forceReset) it emits forceReset separate.
  // update scores
  renderScores(s.scores || { team1:0, team2:0 });

  // if no admin present, go to screen 1 (only input)
  const adminExists = (s.players || []).some(p => p.isAdmin);
  if (!adminExists) {
    // server requires admin for app to advance: show screen 1
    showScreen(1);
    return;
  }

  // if we haven't set our own me.displayName, set from players list if present
  const mePlayer = (s.players || []).find(p => p.id === me.id);
  if (mePlayer) {
    me.displayName = mePlayer.displayName;
    me.isAdmin = mePlayer.isAdmin;
  }

  // if joined (have me.id), show lobby screen by default
  if (me.id) {
    showScreen(2);
  }

  // render lists
  renderPlayersLists(s.players || []);

  // categories for modal
  // store local selection to present in modal
  localSelectedCategories = s.categoriesSelected || [];
  // Prepare modal categories UI when opened (not automatically)
  // show selection screen (screen4) when admin selected player exists
  if (s.selectedPlayerId) {
    // show selection panel so everyone sees players list and admin selection highlight
    showScreen(4);
  }

  // handle round active
  if (s.roundActive && s.roundInfo) {
    // someone started a round
    endTime = s.roundInfo.endTime;
    const currentPlayerId = s.roundInfo.currentPlayerId;
    if (currentPlayerId === me.id) {
      // I'm active player -> show 5a
      showScreen('5a');
    } else {
      // spectator -> show 5b
      showScreen('5b');
    }
    // render current word (if active)
    if (s.roundInfo.currentWord) {
      wordArea.textContent = s.roundInfo.currentWord;
      wordArea.classList.remove('hidden');
      skipText.classList.add('hidden');
    } else {
      // maybe skipping
      wordArea.textContent = '';
      if (s.roundInfo.skipUntil && Date.now() < s.roundInfo.skipUntil) {
        skipText.classList.remove('hidden');
        wordArea.classList.add('hidden');
      } else {
        wordArea.classList.remove('hidden');
        skipText.classList.add('hidden');
      }
    }

    // pular should disappear when <=5s
    const remaining = Math.max(0, Math.round((endTime - Date.now())/1000));
    if (remaining <= 5) {
      btnSkip.style.display = 'none';
    } else {
      btnSkip.style.display = '';
    }

    // keep the countdown in sync using rAF
    startCountdownLoop();
  } else {
    // no active round: hide round screens, show results if round just ended? The server will emit roundEnded separate.
    stopCountdownLoop();
  }

  // results list update
  if (s.roundInfo && s.roundInfo.wordHistory) {
    resultsList.innerHTML = '';
    s.roundInfo.wordHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-item ' + (entry.status === 'correct' ? 'correct' : 'skipped');
      div.innerHTML = `<div>${escapeHtml(entry.word)}</div><div>${entry.status === 'correct' ? '+' : '-'}</div>`;
      resultsList.appendChild(div);
    });
  }
});

// a forced reset by server (admin left)
socket.on('forceReset', () => {
  // clear client state and go back to screen 1
  me = { id: null, isAdmin: false, displayName: null };
  state = null;
  endTime = null;
  stopCountdownLoop();
  // clear UI
  lobbyEl.innerHTML = '';
  team1El.innerHTML = '';
  team2El.innerHTML = '';
  resultsList.innerHTML = '';
  showScreen(1);
  // clear name input
  nameInput.value = '';
});

// round started notification (server didn't require clients to act)
socket.on('roundStarted', (info) => {
  endTime = info.endTime;
  // UI will be reconciled by 'state' events which also arrive frequently
});

// round ended
socket.on('roundEnded', (res) => {
  // show results screen (6)
  showScreen(6);
  // render results already updated via state, but ensure we show list from res if available
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

// adminAdvance simple handler (not used heavily)
socket.on('adminAdvance', () => {
  // server-driven global advance — for simplicity just go to lobby if no round
  showScreen(2);
});

// server instructs to go to lobby
socket.on('goToLobby', () => {
  showScreen(2);
});

// helper timers
function startCountdownLoop() {
  if (rafTimer) return;
  function tick() {
    if (!endTime) {
      stopCountdownLoop(); return;
    }
    const ms = Math.max(0, endTime - Date.now());
    const sec = Math.ceil(ms / 1000);
    // show integer seconds (big)
    if (!screen5a.classList.contains('hidden')) {
      roundTime.textContent = (sec).toString();
      // hide skip when <=5s
      if (ms <= 5000) btnSkip.style.display = 'none';
      else btnSkip.style.display = '';
    }
    if (!screen5b.classList.contains('hidden')) {
      roundTime2.textContent = (sec).toString();
    }
    rafTimer = requestAnimationFrame(tick);
  }
  rafTimer = requestAnimationFrame(tick);
}

function stopCountdownLoop() {
  if (rafTimer) cancelAnimationFrame(rafTimer);
  rafTimer = null;
}

// open categories modal with current categories
function openCategoriesModal() {
  // state holds categoriesAvailable and selected
  if (!state) return;
  const all = state.categoriesAvailable || [];
  const selected = state.categoriesSelected || [];
  renderCategoriesModal(all, selected);
  modalCategories.classList.remove('hidden');
}

function renderCategoriesModal(all, selected) {
  categoriesList.innerHTML = '';
  all.forEach(c => {
    const row = document.createElement('div');
    row.className = 'category-row';
    const id = 'cat-' + c;
    row.innerHTML = `
      <input type="checkbox" id="${id}" value="${c}" ${selected.includes(c) ? 'checked' : ''} ${me.isAdmin ? '' : 'disabled'}>
      <label for="${id}">${escapeHtml(c)}</label>
    `;
    categoriesList.appendChild(row);
  });
}

// helper escape for inner text already above

// update state wrapper to keep latest state
socket.on('state', (s) => {
  state = s;
});


// UI: selection of chosen player and show "Iniciar" only to selected player
// To show "Iniciar" button: we add a control in the players list when appropriate
function updateSelectionUI() {
  // called after state update; add an "Iniciar" button for the selected player only visible to that player
  if (!state) return;
  const selectedId = state.selectedPlayerId;
  // clear previous
  // we will render a little area in screen 4 players list
  // (playersContainer is re-rendered on each state update)
}

// Add dynamic behavior: when screen-4 is visible, show start button to selected player
const observer = new MutationObserver(() => {
  // when players list is re-rendered, attach "Iniciar" button to the selected player if it's me
  if (!state) return;
  if (!state.selectedPlayerId) return;
  if (state.selectedPlayerId !== me.id) return;
  // find the player's node in playersContainer
  Array.from(playersContainer.children).forEach(div => {
    // text content contains display name; match by state players
    // simpler: append button at bottom if I'm selected
  });
});
observer.observe(playersContainer, { childList: true, subtree: true });

// Simpler approach: watch server state changes and if I'm the selected player, show a small floating start button
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

// react to state changes to display floating start
socket.on('state', (s) => {
  state = s;
  // show start if I'm the selected player and not in a round
  if (s.selectedPlayerId === me.id && !s.roundActive) {
    floatingStart.style.display = '';
  } else {
    floatingStart.style.display = 'none';
  }

  // Render players lists and scores (also done earlier)
  renderPlayersLists(s.players || []);
  renderScores(s.scores || { team1:0, team2:0 });

  // categories selected store
  localSelectedCategories = s.categoriesSelected || [];

  // show appropriate screens
  const adminExists = (s.players || []).some(p => p.isAdmin);
  if (!adminExists) {
    showScreen(1);
    return;
  }

  // if round active -> screens 5a/5b handled earlier by separate handler
  if (!s.roundActive && s.selectedPlayerId) {
    // show selection screen
    showScreen(4);
  } else if (!s.roundActive && !s.selectedPlayerId) {
    // show lobby / teams
    showScreen(2);
  }

  // update results list for screen 6 if present
  if (s.roundInfo && s.roundInfo.wordHistory) {
    resultsList.innerHTML = '';
    s.roundInfo.wordHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-item ' + (entry.status === 'correct' ? 'correct' : 'skipped');
      div.innerHTML = `<div>${escapeHtml(entry.word)}</div><div>${entry.status === 'correct' ? '+' : '-'}</div>`;
      resultsList.appendChild(div);
    });
  }

  // update round visuals if active
  if (s.roundActive) {
    endTime = s.roundInfo.endTime;
    if (s.roundInfo.currentPlayerId === me.id) {
      showScreen('5a');
      // show/hide skip depending on skip state and remaining
      if (s.roundInfo.skipUntil && Date.now() < s.roundInfo.skipUntil) {
        skipText.classList.remove('hidden');
        wordArea.classList.add('hidden');
      } else {
        skipText.classList.add('hidden');
        wordArea.classList.remove('hidden');
      }
      if (s.roundInfo.currentWord) {
        wordArea.textContent = s.roundInfo.currentWord;
      } else {
        wordArea.textContent = '';
      }
    } else {
      showScreen('5b');
    }
    startCountdownLoop();
  } else {
    stopCountdownLoop();
  }
});

// small helper to show modal categories with current selection (when opened)
function renderCategoriesModal(all, selected) {
  categoriesList.innerHTML = '';
  all.forEach(c => {
    const row = document.createElement('div');
    row.className = 'category-row';
    const id = 'cat-' + c;
    row.innerHTML = `
      <input type="checkbox" id="${id}" value="${c}" ${selected.includes(c) ? 'checked' : ''} ${me.isAdmin ? '' : 'disabled'}>
      <label for="${id}">${escapeHtml(c)}</label>
    `;
    categoriesList.appendChild(row);
  });
  modalCategories.classList.remove('hidden');
}

// when server asks to open categories via buttons earlier
btnCategorias.addEventListener('click', () => {
  if (!state) return;
  renderCategoriesModal(state.categoriesAvailable || [], state.categoriesSelected || []);
});
btnCategorias2.addEventListener('click', () => {
  if (!state) return;
  renderCategoriesModal(state.categoriesAvailable || [], state.categoriesSelected || []);
});

// small UX: if user clicks anywhere outside modal, close it
modalCategories.addEventListener('click', (e) => {
  if (e.target === modalCategories) modalCategories.classList.add('hidden');
});
