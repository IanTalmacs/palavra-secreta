const socket = io();
let me = { id: null, name: null, role: 'visitor' };
let categories = [];
let scores = { equipe1: 0, equipe2: 0 };
let selectedCategory = null;
let selectedPlayerId = null;
let roundActiveForMe = false;
let roundTimer = null;
let roundRemaining = 75;

const initialScreen = document.getElementById('initial-screen');
const nameInput = document.getElementById('nameInput');
const confirmName = document.getElementById('confirmName');
const roleButtons = document.getElementById('roleButtons');
const btnVisitor = document.getElementById('btnVisitor');
const btnAdmin = document.getElementById('btnAdmin');
const adminPass = document.getElementById('adminPass');
const passInput = document.getElementById('passInput');
const submitPass = document.getElementById('submitPass');

const gameScreen = document.getElementById('game-screen');
const categoryButtons = document.getElementById('categoryButtons');
const playerButtons = document.getElementById('playerButtons');
const startRoundWrap = document.getElementById('startRoundWrap');
const startRoundBtn = document.getElementById('startRoundBtn');

const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const resetBtn = document.getElementById('resetBtn');

const roundSection = document.getElementById('roundSection');
const roundTimerEl = document.getElementById('roundTimer');
const roundWordEl = document.getElementById('roundWord');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const skipMessage = document.getElementById('skipMessage');

const verification = document.getElementById('verification');
const verificationList = document.getElementById('verificationList');
const continueBtn = document.getElementById('continueBtn');

confirmName.addEventListener('click', ()=>{
  const name = nameInput.value.trim() || 'Visitante';
  me.name = name;
  socket.emit('join', { name });
  roleButtons.classList.remove('hidden');
});

btnVisitor.addEventListener('click', ()=>{
  socket.emit('becomeVisitor');
  enterGame();
});

btnAdmin.addEventListener('click', ()=>{
  adminPass.classList.remove('hidden');
  roleButtons.classList.add('hidden');
});

submitPass.addEventListener('click', ()=>{
  const pass = passInput.value || '';
  socket.emit('becomeAdmin', { password: pass });
});

socket.on('adminAccepted', ()=>{
  enterGame();
  me.role = 'admin';
  updateAdminUI();
});

socket.on('adminDenied', ()=>{
  alert('Senha incorreta');
});

function enterGame(){
  initialScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  updateAdminUI();
}

socket.on('init', (data)=>{
  categories = data.categories || [];
  scores = data.scores || scores;
  renderCategories();
  updateScores();
});

socket.on('players', (list)=>{
  renderPlayers(list);
});

socket.on('state', (s)=>{
  categories = s.categories || categories;
  selectedCategory = s.selectedCategory || null;
  selectedPlayerId = s.selectedPlayerId || null;
  renderCategories();
  renderPlayersFromState(s.players || []);
  updateScoresDisplay(s.scores || scores);
  if (!s.currentRoundActive) {
    hideRoundForAll();
  }
});

socket.on('scores', (sc)=>{
  scores = sc;
  updateScores();
});

function updateScoresDisplay(sc){
  if (!sc) return;
  scores = sc;
  updateScores();
}

function updateScores(){
  score1El.textContent = scores.equipe1;
  score2El.textContent = scores.equipe2;
}

function updateAdminUI(){
  if (me.role === 'admin') {
    document.querySelectorAll('.score-controls .btn').forEach(b=>b.style.display='inline-block');
    resetBtn.style.display = 'inline-block';
    document.querySelectorAll('.btn.catBtn, .btn.playerBtn').forEach(b=>{
      b.disabled = false;
    });
  } else {
    document.querySelectorAll('.score-controls .btn').forEach(b=>b.style.display='none');
    resetBtn.style.display = 'none';
  }
}

function renderCategories(){
  categoryButtons.innerHTML = '';
  categories.forEach(cat=>{
    const b = document.createElement('button');
    b.className = 'btn catBtn';
    b.textContent = cat;
    b.dataset.cat = cat;
    if (selectedCategory === cat) b.classList.add('selected');
    b.addEventListener('click', ()=>{
      if (me.role !== 'admin') return;
      selectedCategory = cat;
      socket.emit('selectCategory', cat);
      document.querySelectorAll('.btn.catBtn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
      checkStartVisible();
    });
    categoryButtons.appendChild(b);
  });
}

function renderPlayers(list){
  playerButtons.innerHTML = '';
  list.forEach(p=>{
    const b = document.createElement('button');
    b.className = 'btn playerBtn';
    b.textContent = p.name + (p.role === 'admin' ? ' (Admin)' : '');
    b.dataset.id = p.id;
    b.addEventListener('click', ()=>{
      if (me.role !== 'admin') {
        if (p.id === me.id) {
          selectedPlayerId = p.id;
          checkStartVisible();
        }
        return;
      }
      selectedPlayerId = p.id;
      socket.emit('selectPlayer', p.id);
      document.querySelectorAll('.btn.playerBtn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
      checkStartVisible();
    });
    playerButtons.appendChild(b);
  });
}

function renderPlayersFromState(list){
  playerButtons.innerHTML = '';
  list.forEach(p=>{
    const b = document.createElement('button');
    b.className = 'btn playerBtn';
    b.textContent = p.name + (p.role === 'admin' ? ' (Admin)' : '');
    b.dataset.id = p.id;
    if (selectedPlayerId === p.id) b.classList.add('selected');
    b.addEventListener('click', ()=>{
      if (me.role !== 'admin') {
        if (p.id === me.id) {
          selectedPlayerId = p.id;
          checkStartVisible();
        }
        return;
      }
      selectedPlayerId = p.id;
      socket.emit('selectPlayer', p.id);
      document.querySelectorAll('.btn.playerBtn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
      checkStartVisible();
    });
    playerButtons.appendChild(b);
  });
  checkStartVisible();
}

function checkStartVisible(){
  if (selectedCategory && selectedPlayerId && me.role === 'admin') {
    startRoundWrap.classList.remove('hidden');
  } else {
    startRoundWrap.classList.add('hidden');
  }
}

startRoundBtn.addEventListener('click', ()=>{
  socket.emit('startRound');
});

socket.on('roundStart', ({duration})=>{
  roundActiveForMe = true;
  roundRemaining = duration;
  roundSection.classList.remove('collapsed');
  roundSection.classList.add('expanded');
  verification.classList.add('collapsed');
  startLocalTimer();
});

socket.on('roundWord', ({word, remaining})=>{
  roundWordEl.textContent = word;
  roundRemaining = remaining;
  roundTimerEl.textContent = remaining;
});

socket.on('roundHiddenForAll', ({except})=>{
  if (socket.id !== except) {
    hideRoundForAll();
  }
});

function hideRoundForAll(){
  roundSection.classList.add('collapsed');
  roundSection.classList.remove('expanded');
  roundActiveForMe = false;
  stopLocalTimer();
}

function startLocalTimer(){
  stopLocalTimer();
  roundTimerEl.textContent = roundRemaining;
  roundTimer = setInterval(()=>{
    roundRemaining = Math.max(0, roundRemaining - 1);
    roundTimerEl.textContent = roundRemaining;
    if (roundRemaining <= 0) {
      clearInterval(roundTimer);
    }
  }, 1000);
}

function stopLocalTimer(){
  if (roundTimer) clearInterval(roundTimer);
  roundTimer = null;
}

correctBtn.addEventListener('click', ()=>{
  socket.emit('roundCorrect');
});

skipBtn.addEventListener('click', ()=>{
  skipBtn.disabled = true;
  skipMessage.textContent = 'Pulando...';
  socket.emit('roundSkip');
  setTimeout(()=>{
    skipBtn.disabled = false;
    skipMessage.textContent = '';
  }, 3000);
});

socket.on('roundEnded', ({report})=>{
  roundSection.classList.add('collapsed');
  verification.classList.remove('collapsed');
  verification.classList.add('expanded');
  verificationList.innerHTML = '';
  report.forEach(r=>{
    const d = document.createElement('div');
    d.textContent = r.word;
    d.className = 'verItem';
    d.style.padding = '10px';
    d.style.borderRadius = '8px';
    d.style.margin = '6px 0';
    if (r.status === 'correct') {
      d.style.background = 'rgba(34,197,94,0.15)';
      d.style.color = '#a7f3d0';
    } else {
      d.style.background = 'rgba(239,68,68,0.12)';
      d.style.color = '#fecaca';
    }
    verificationList.appendChild(d);
  });
});

continueBtn.addEventListener('click', ()=>{
  socket.emit('continueAfterVerification');
  verification.classList.add('collapsed');
  verification.classList.remove('expanded');
  startRoundWrap.classList.add('hidden');
});

resetBtn.addEventListener('click', ()=>{
  if (me.role !== 'admin') return;
  socket.emit('reset');
});

document.querySelectorAll('.score-controls .btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    if (me.role !== 'admin') return;
    const team = Number(b.dataset.team);
    const delta = b.dataset.action === 'add' ? 1 : -1;
    socket.emit('changeScore', { team, delta });
  });
});

socket.on('resetAll', ()=>{
  location.reload();
});

window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});
