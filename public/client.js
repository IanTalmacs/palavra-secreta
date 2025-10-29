const socket = io();

let myId = null;
let amAdmin = false;
let currentScreen = 'screen-1';
let clientState = null;

function $(sel){return document.querySelector(sel)}
function $all(sel){return Array.from(document.querySelectorAll(sel))}

function showScreen(id){
  currentScreen = id;
  $all('.screen').forEach(s => s.classList.remove('active'));
  const el = $(`#${id}`);
  if (el) el.classList.add('active');
}

window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

$('#confirmName').addEventListener('click', () => {
  const name = $('#nameInput').value.trim();
  if (!name) return;
  socket.emit('join', name);
  showScreen('screen-2');
});

socket.on('joined', ({id, isAdmin}) => {
  myId = id;
  amAdmin = isAdmin;
  refreshAdminUI();
});

socket.on('state', (st) => {
  clientState = st;
  updateUIFromState(st);
});

socket.on('goto', ({screen, activePlayerId, team}) => {
  if (screen === 'categories') showScreen('screen-3');
  else if (screen === 'prepare') {
    // show screen 4
    showScreen('screen-4');
    const ap = activePlayerId;
    const player = (clientState && clientState.players.find(p=>p.id===ap)) || {};
    $('#prepareText').textContent = `preparar ${player.displayName || ''}`;
    if (myId === ap) {
      $('#startBtn').style.display = 'inline-block';
    } else {
      $('#startBtn').style.display = 'none';
    }
  }
});

socket.on('new-word', ({word}) => {
  showScreen('screen-5a');
  $('#timerTop').textContent = clientState && clientState.currentTurn ? clientState.currentTurn.timeLeft : '75';
  $('#wordBox').textContent = word;
  $('#btnPular').style.display = 'inline-flex';
});

socket.on('skip', () => {
  // hide word/buttons for 3s (server also triggers)
  $('#wordBox').textContent = 'pulando...';
  $('#btnPular').style.display = 'none';
  $('#btnAcertou').style.display = 'none';
});

socket.on('time-update', ({timeLeft}) => {
  if (currentScreen === 'screen-5a') $('#timerTop').textContent = timeLeft;
  if (currentScreen === 'screen-5b') $('#timerOnly').textContent = timeLeft;
  // if time is low, hide pular on clients
  if (timeLeft <= 5) {
    $('#btnPular').style.display = 'none';
  }
});

socket.on('time-is-five', () => {
  $('#btnPular').style.display = 'none';
});

socket.on('turn-ended', (result) => {
  showScreen('screen-6');
  const correctList = $('#correctList');
  const skippedList = $('#skippedList');
  correctList.innerHTML = '';
  skippedList.innerHTML = '';
  for (const w of result.correctWords) {
    const li = document.createElement('li'); li.textContent = w; li.className = 'correct'; correctList.appendChild(li);
  }
  for (const w of result.skippedWords) {
    const li = document.createElement('li'); li.textContent = w; li.className = 'skipped'; skippedList.appendChild(li);
  }
});

socket.on('no-more-words', () => {
  $('#wordBox').textContent = 'sem palavras';
});

socket.on('confirm-finish', () => {
  $('#confirmModal').classList.add('show');
});

socket.on('game-over', ({teamScores}) => {
  $('#final1').textContent = teamScores.team1 || 0;
  $('#final2').textContent = teamScores.team2 || 0;
  showScreen('screen-final');
});

socket.on('reset', () => {
  // all go to screen 1
  showScreen('screen-1');
  myId = null;
  amAdmin = false;
  clientState = null;
  refreshAdminUI();
});

// UI interactions
$('#categoriesBtn').addEventListener('click', () => socket.emit('start-categories'));
$('#finalizarBtn').addEventListener('click', () => socket.emit('finalizar'));
$('#confirmNo').addEventListener('click', () => {
  $('#confirmModal').classList.remove('show');
});
$('#confirmYes').addEventListener('click', () => {
  $('#confirmModal').classList.remove('show');
  socket.emit('confirm-finish', true);
});
$('#advanceBtn').addEventListener('click', () => socket.emit('advance-after-turn'));
$('#startBtn').addEventListener('click', () => socket.emit('start-turn'));
$('#btnAcertou').addEventListener('click', () => socket.emit('acertou'));
$('#btnPular').addEventListener('click', () => socket.emit('pular'));

// drag and drop for admin
document.addEventListener('dragstart', (e) => {
  const id = e.target.getAttribute('data-id');
  if (id) {
    e.dataTransfer.setData('text/plain', id);
  }
});
$all('.dropzone').forEach(z => {
  z.addEventListener('dragover', (e) => e.preventDefault());
  z.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const team = z.getAttribute('data-team');
    if (id && team) socket.emit('assign-team', { playerId: id, team });
  });
});

// render helpers
function updateUIFromState(st) {
  // players lists
  const lobby = $('#lobbyList');
  const t1 = $('#team1List');
  const t2 = $('#team2List');
  lobby.innerHTML = ''; t1.innerHTML = ''; t2.innerHTML = '';

  (st.players || []).forEach(p => {
    const div = document.createElement('div');
    div.className = 'player draggable';
    div.setAttribute('data-id', p.id);
    div.setAttribute('draggable', amAdmin ? 'true' : 'false');
    div.innerHTML = `<span class="name">${escapeHtml(p.displayName)}</span>`;
    if (p.team === 'lobby') lobby.appendChild(div);
    else if (p.team === 'team1') t1.appendChild(div);
    else if (p.team === 'team2') t2.appendChild(div);
  });

  $('#score1').textContent = (st.teamScores && st.teamScores.team1) || 0;
  $('#score2').textContent = (st.teamScores && st.teamScores.team2) || 0;

  // categories
  const catGrid = $('#categoriesGrid');
  catGrid.innerHTML = '';
  const mapping = {
    animais: 'animais',
    tv_cinema: 'tv e cinema',
    objetos: 'objetos',
    lugares: 'lugares',
    pessoas: 'pessoas',
    esportes_jogos: 'esportes e jogos',
    profissoes: 'profissões',
    alimentos: 'alimentos',
    personagens: 'personagens',
    biblico: 'bíblico'
  };
  (st.categoriesRemaining || []).forEach(key => {
    const btn = document.createElement('div');
    btn.className = 'cat';
    btn.textContent = mapping[key] || key;
    btn.addEventListener('click', () => {
      if (!amAdmin) return;
      socket.emit('select-category', key);
    });
    catGrid.appendChild(btn);
  });

  // update which screen to show based on server provided context
  if (st.currentCategory === null && currentScreen === 'screen-3') {
    // stay in categories
  }
}

function refreshAdminUI(){
  if (amAdmin) {
    $('#categoriesBtn').style.display = 'inline-block';
    $('#finalizarBtn').style.display = 'inline-block';
    $all('.player').forEach(el => el.setAttribute('draggable','true'));
  } else {
    $('#categoriesBtn').style.display = 'none';
    $('#finalizarBtn').style.display = 'none';
    $all('.player').forEach(el => el.setAttribute('draggable','false'));
  }
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
