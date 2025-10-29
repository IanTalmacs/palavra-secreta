const socket = io();

// simple screen manager
const screens = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
};

const nameInput = document.getElementById('nameInput');
const confirmName = document.getElementById('confirmName');
const scoreEl = document.getElementById('score');

// screen elements
const lobbyList = document.getElementById('lobbyList');
const team1List = document.getElementById('team1List');
const team2List = document.getElementById('team2List');
const startCategoriesBtn = document.getElementById('startCategories');
const catsDiv = document.getElementById('cats');
const finishCategoryBtn = document.getElementById('finishCategory');
const prepareText = document.getElementById('prepareText');
const startTurnBtn = document.getElementById('startTurnBtn');
const timeTop = document.getElementById('timeTop');
const timeTop2 = document.getElementById('timeTop2');
const wordLarge = document.getElementById('wordLarge');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const nextTeamBtn = document.getElementById('nextTeamBtn');
const listResults = document.getElementById('listResults');
const finishYes = document.getElementById('finishYes');
const finishNo = document.getElementById('finishNo');
const finalScore = document.getElementById('finalScore');

let myId = null;
let myIsAdmin = false;
let currentChooserId = null;
let currentRound = null;
let localTime = 0;
let skipHidden = false;

confirmName.addEventListener('click', ()=>{
  const val = nameInput.value.trim();
  if (!val) return;
  socket.emit('join', val);
  screens('screen-2');
});

// drag & drop helper
function makeDraggable(li) {
  li.draggable = true;
  li.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', li.dataset.id); });
}

[lobbyList, team1List, team2List].forEach(list => {
  list.addEventListener('dragover', e => e.preventDefault());
  list.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const targetTeam = list.id === 'lobbyList' ? 'lobby' : (list.id === 'team1List' ? 'team1' : 'team2');
    socket.emit('assign', { playerId: id, team: targetTeam });
  });
});

startCategoriesBtn.addEventListener('click', ()=> socket.emit('startCategories'));

finishCategoryBtn.addEventListener('click', ()=> socket.emit('selectCategory', finishCategoryBtn.dataset.cat));

startTurnBtn.addEventListener('click', ()=> {
  socket.emit('startTurn');
  screens('screen-5a');
});

correctBtn.addEventListener('click', ()=> socket.emit('correct'));
skipBtn.addEventListener('click', ()=> socket.emit('skip'));
nextTeamBtn.addEventListener('click', ()=> socket.emit('nextTeam'));

finishYes.addEventListener('click', ()=> socket.emit('finishConfirm', true));
finishNo.addEventListener('click', ()=> socket.emit('finishConfirm', false));

// socket events
socket.on('connect', ()=>{ myId = socket.id; socket.emit('requestState'); });

socket.on('state', (s)=>{
  // players list
  lobbyList.innerHTML = '';
  team1List.innerHTML = '';
  team2List.innerHTML = '';
  (s.players||[]).forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name || 'player';
    li.dataset.id = p.id;
    makeDraggable(li);
    if (p.team === 'lobby') lobbyList.appendChild(li);
    else if (p.team === 'team1') team1List.appendChild(li);
    else if (p.team === 'team2') team2List.appendChild(li);
    if (p.id === myId) myIsAdmin = p.isAdmin;
  });
  // categories
  // update cats only when screen-3 visible
  scoreEl.textContent = `${(s.scores.team1||0)} — ${(s.scores.team2||0)}`;
});

socket.on('showCategories', ({categories})=>{
  catsDiv.innerHTML = '';
  categories.forEach(c => {
    const b = document.createElement('button');
    b.textContent = c;
    b.addEventListener('click', ()=>{
      finishCategoryBtn.dataset.cat = c;
      // admin click -> select
      socket.emit('selectCategory', c);
    });
    catsDiv.appendChild(b);
  });
  screens('screen-3');
});

socket.on('prepareChooser', ({team, player})=>{
  currentChooserId = player.id;
  prepareText.textContent = `preparar ${player.name}`;
  // only chooser sees start
  if (player.id === myId) startTurnBtn.classList.remove('hidden'); else startTurnBtn.classList.add('hidden');
  screens('screen-4');
});

socket.on('turnStarted', ({word,timeLeft})=>{
  localTime = timeLeft;
  timeTop.textContent = localTime;
  wordLarge.textContent = word || '';
  screens('screen-5a');
});

socket.on('turnViewer', ({timeLeft, chooserId})=>{
  localTime = timeLeft;
  timeTop2.textContent = localTime;
  screens('screen-5b');
  currentChooserId = chooserId;
});

socket.on('tick', ({timeLeft})=>{
  localTime = timeLeft;
  if (!document.getElementById('screen-5a').classList.contains('hidden')) timeTop.textContent = localTime;
  if (!document.getElementById('screen-5b').classList.contains('hidden')) timeTop2.textContent = localTime;
});

socket.on('hideSkip', ()=>{ skipBtn.classList.add('hidden'); });

socket.on('skipCooldown', ()=>{
  // hide both big buttons for 3s for chooser
  correctBtn.classList.add('hidden');
  skipBtn.classList.add('hidden');
  setTimeout(()=>{ correctBtn.classList.remove('hidden'); skipBtn.classList.remove('hidden'); }, 3000);
});

socket.on('nextWord', ({word})=>{ wordLarge.textContent = word || ''; });

socket.on('scoreUpdate', (scores)=>{ scoreEl.textContent = `${scores.team1} — ${scores.team2}`; });

socket.on('roundEnded', ({correct, skipped})=>{
  listResults.innerHTML = '';
  if (correct && correct.length) {
    const h = document.createElement('div'); h.textContent = 'Acertadas:'; listResults.appendChild(h);
    correct.forEach(w=>{ const el = document.createElement('div'); el.textContent = w; el.classList.add('listItemCorrect'); listResults.appendChild(el); });
  }
  if (skipped && skipped.length) {
    const h = document.createElement('div'); h.textContent = 'Puladas:'; listResults.appendChild(h);
    skipped.forEach(w=>{ const el = document.createElement('div'); el.textContent = w; el.classList.add('listItemSkip'); listResults.appendChild(el); });
  }
  // only admin can press nextTeam
  if (myIsAdmin) nextTeamBtn.classList.remove('hidden'); else nextTeamBtn.classList.add('hidden');
  screens('screen-6');
});

socket.on('backToCategories', ({categories, usedCategories, scores})=>{
  scoreEl.textContent = `${scores.team1} — ${scores.team2}`;
  screens('screen-3');
  // cats will be requested via server->showCategories when admin clicks
});

socket.on('final', ({scores})=>{
  finalScore.textContent = `${scores.team1} — ${scores.team2}`;
  screens('screen-final');
});

socket.on('errorMsg', (m)=>{ console.warn(m); });

// beforeunload warning
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});

// initial screen
screens('screen-1');