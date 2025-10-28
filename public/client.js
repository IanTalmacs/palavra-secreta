const socket = io();

// UI refs
const screen1 = document.getElementById('screen1');
const screen2 = document.getElementById('screen2');
const screen3 = document.getElementById('screen3');
const screen4 = document.getElementById('screen4');
const screen5 = document.getElementById('screen5');
const screen6 = document.getElementById('screen6');
const screen7 = document.getElementById('screen7');
const finalScreen = document.getElementById('finalScreen');
const scorebar = document.getElementById('scorebar');

const nameInput = document.getElementById('nameInput');
const enterBtn = document.getElementById('enterBtn');
const visitorBtn = document.getElementById('visitorBtn');
const adminBtn = document.getElementById('adminBtn');
const adminPass = document.getElementById('adminPass');
const adminConfirm = document.getElementById('adminConfirm');

const lobbyList = document.getElementById('lobbyList');
const team1List = document.getElementById('team1List');
const team2List = document.getElementById('team2List');
const categoriesGrid = document.getElementById('categoriesGrid');
const categoriesBtn = document.getElementById('categoriesBtn');
const finishBtn = document.getElementById('finishBtn');
const backLobbyBtn = document.getElementById('backLobbyBtn');
const prepareText = document.getElementById('prepareText');
const prepName = document.getElementById('prepName');
const startTurnBtn = document.getElementById('startTurnBtn');
const timerDisplay = document.getElementById('timerDisplay');
const wordDisplay = document.getElementById('wordDisplay');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const resultsList = document.getElementById('resultsList');
const verifyAdvance = document.getElementById('verifyAdvance');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const finalScore = document.getElementById('finalScore');

let myId = null;
let myName = null;
let myRole = 'visitor';
let myTeam = 'lobby';
let currentPlayerId = null; // who is performing turn
let isInTurn = false;
let currentWord = null;
let currentTime = 0;
let lastState = null;

function showScreen(el){
  [screen1,screen2,screen3,screen4,screen5,screen6,screen7,finalScreen].forEach(s=>s.classList.add('hidden'));
  el.classList.remove('hidden');
  // scorebar visible only after leaving the name screen
  if (el === screen1) {
    scorebar.style.display = 'none';
  } else {
    scorebar.style.display = 'block';
  }
  // prevent the confirm overlay from blocking clicks when hidden
  if (confirmOverlay.classList.contains('hidden')) {
    confirmOverlay.style.pointerEvents = 'none';
  } else {
    confirmOverlay.style.pointerEvents = 'auto';
  }
}

enterBtn.onclick = ()=>{
  myName = nameInput.value || 'Anon';
  socket.emit('join', myName);
  showScreen(screen2);
}
visitorBtn.onclick = ()=>{
  socket.emit('chooseRole', { role: 'visitor' });
  showScreen(screen3);
}
adminBtn.onclick = ()=>{
  adminPass.classList.remove('hidden');
  adminConfirm.classList.remove('hidden');
}
adminConfirm.onclick = ()=>{
  const pw = adminPass.value || '';
  socket.emit('chooseRole', { role: 'admin', password: pw });
}

categoriesBtn.onclick = ()=> socket.emit('openCategories');
backLobbyBtn.onclick = ()=> socket.emit('showLobby');
finishBtn.onclick = ()=> socket.emit('finalizeRequest');

startTurnBtn.onclick = ()=> socket.emit('startTurn');
correctBtn.onclick = ()=> socket.emit('correct');
skipBtn.onclick = ()=> socket.emit('skip');
verifyAdvance.onclick = ()=> socket.emit('adminAdvance');

confirmYes.onclick = ()=> socket.emit('confirmFinalize', true);
confirmNo.onclick = ()=> socket.emit('confirmFinalize', false);

// handle beforeunload
window.addEventListener('beforeunload', (e)=>{
  e.preventDefault();
  e.returnValue = '';
});

// drag and drop for admin
function makePlayerItem(id, name){
  const div = document.createElement('div');
  div.className = 'playerItem';
  div.draggable = true;
  div.dataset.id = id;
  div.textContent = name;
  div.addEventListener('dragstart', (ev)=>{
    ev.dataTransfer.setData('text/plain', id);
  });
  return div;
}

[lobbyList, team1List, team2List].forEach(zone=>{
  zone.addEventListener('dragover', ev=>{ ev.preventDefault(); });
  zone.addEventListener('drop', ev=>{
    ev.preventDefault();
    const pid = ev.dataTransfer.getData('text/plain');
    if (!pid) return;
    const team = zone.id === 'lobbyList' ? 'lobby' : (zone.id === 'team1List' ? 'team1' : 'team2');
    socket.emit('assignTeam', { playerId: pid, team });
  });
});

// socket handlers
socket.on('connect', ()=>{ myId = socket.id; });

socket.on('state', s=>{
  lastState = s;
  // update score
  scorebar.textContent = `${s.scores.team1} - ${s.scores.team2}`;
  // build lists
  lobbyList.innerHTML=''; team1List.innerHTML=''; team2List.innerHTML='';
  Object.entries(s.players).forEach(([id,p])=>{
    const item = makePlayerItem(id,p.name);
    if (p.team === 'lobby') lobbyList.appendChild(item);
    else if (p.team === 'team1') team1List.appendChild(item);
    else if (p.team === 'team2') team2List.appendChild(item);
    if (id === myId) { myRole = p.role; myTeam = p.team; }
  });
  // auto-show lobby if screen3 visible
});

socket.on('adminDenied', ()=>{
  alert('Senha incorreta');
});

socket.on('showCategories', cats=>{
  categoriesGrid.innerHTML='';
  cats.forEach(c=>{
    const b = document.createElement('button');
    b.className='categoryBtn';
    b.textContent = c;
    b.onclick = ()=> socket.emit('selectCategory', c);
    categoriesGrid.appendChild(b);
  });
  showScreen(screen4);
});

socket.on('categorySelected', ({ category, currentPlayer, currentTeam })=>{
  // show prepare screen
  currentPlayerId = currentPlayer;
  prepName.textContent = currentPlayer ? (lastState.players[currentPlayer].name) : '---';
  showScreen(screen5);
  // if I'm the chosen player, show iniciar
  if (currentPlayer === myId) startTurnBtn.classList.remove('hidden'); else startTurnBtn.classList.add('hidden');
});

socket.on('prepareTurn', ({ currentPlayer, currentTeam })=>{
  currentPlayerId = currentPlayer;
  prepName.textContent = currentPlayer ? (lastState.players[currentPlayer].name) : '---';
  showScreen(screen5);
  if (currentPlayer === myId) startTurnBtn.classList.remove('hidden'); else startTurnBtn.classList.add('hidden');
});

socket.on('turnStarted', ({ playerId, team, word })=>{
  currentPlayerId = playerId;
  isInTurn = (myId === playerId);
  currentWord = word;
  wordDisplay.textContent = word || '';
  showScreen(screen6);
  if (isInTurn) {
    correctBtn.style.display = 'inline-block';
    skipBtn.style.display = 'inline-block';
  } else {
    correctBtn.style.display = 'none';
    skipBtn.style.display = 'none';
  }
});

socket.on('tick', ({ timeLeft })=>{
  currentTime = timeLeft;
  timerDisplay.textContent = timeLeft;
  if (timeLeft <= 5) {
    skipBtn.style.display = 'none';
  }
});

socket.on('newWord', (word)=>{
  currentWord = word;
  wordDisplay.textContent = word || '';
  // ensure controls visible again
  if (myId === currentPlayerId) {
    correctBtn.style.display = 'inline-block';
    // skip button will auto hide if <=5 by tick events
  }
});

socket.on('skipStart', ()=>{
  // hide controls and show pulando...
  correctBtn.style.display = 'none';
  skipBtn.style.display = 'none';
  wordDisplay.textContent = 'pulando...';
});

socket.on('noMoreWords', ()=>{
  wordDisplay.textContent = 'sem palavras';
});

socket.on('scoreUpdate', scores=>{
  scorebar.textContent = `${scores.team1} - ${scores.team2}`;
});

socket.on('roundEnded', ({ guessed, skipped })=>{
  // show verification screen
  resultsList.innerHTML = '';
  guessed.forEach(w=>{
    const d = document.createElement('div'); d.className='resultItem guessed'; d.textContent = w; resultsList.appendChild(d);
  });
  skipped.forEach(w=>{
    const d = document.createElement('div'); d.className='resultItem skipped'; d.textContent = w; resultsList.appendChild(d);
  });
  showScreen(screen7);
  // only admin can advance
  if (myRole === 'admin') verifyAdvance.disabled = false; else verifyAdvance.disabled = true;
});

socket.on('backToCategories', (cats)=>{
  // hide any open overlays and show categories
  confirmOverlay.classList.add('hidden');
  confirmOverlay.style.pointerEvents = 'none';
  // show categories
  socket.emit('openCategories');
});

socket.on('confirmFinalize', ()=>{
  confirmOverlay.classList.remove('hidden');
  confirmOverlay.style.pointerEvents = 'auto';
});

socket.on('gameOver', ({ scores })=>{
  finalScore.textContent = `${scores.team1} - ${scores.team2}`;
  showScreen(finalScreen);
});

socket.on('showLobbyClients', (lobby)=>{
  // show lobby screen (screen3)
  showScreen(screen3);
});

socket.on('adminGone', ()=>{
  alert('O admin saiu. O jogo foi reiniciado.');
  confirmOverlay.style.pointerEvents = 'none';
scorebar.style.display = 'none';
showScreen(screen1);
});

// initial
showScreen(screen1);

// small UX: clicking Lobby button in categories screen
backLobbyBtn.addEventListener('click', ()=> showScreen(screen3));