const socket = io();
let myId = null;
let myRole = 'visitor';
let state = {};
let currentWord = null;
let timerInterval = null;

function $(s){return document.querySelector(s)}
function el(tag, cls, txt){const e=document.createElement(tag);if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e}

socket.on('connect', ()=>{ myId = socket.id; });

socket.on('state', s=>{ state = s; render(); updateScore(); });
socket.on('timerStarted', ({endAt}) => startLocalTimer(endAt));
socket.on('newWord', ({word}) => { currentWord = word; render(); });
socket.on('skipping', ()=>{ showSkipping(); });
socket.on('noMoreWords', ()=>{ alert('sem mais palavras desta categoria'); });

function updateScore(){
  const t1 = state.scores?.team1 || 0;
  const t2 = state.scores?.team2 || 0;
  $('#scorebar').textContent = `${t1} - ${t2}`;
}

function render(){
  const app = $('#app');
  app.innerHTML='';
  const c = el('div','container');
  app.appendChild(c);

  // phase handling
  const phase = state.phase || 'join';

  if (phase === 'join' || phase === 'lobby') renderJoin(c);
  else if (phase === 'categories') renderCategories(c);
  else if (phase === 'prepare') renderPrepare(c);
  else if (phase === 'turn') renderTurn(c);
  else if (phase === 'review') renderReview(c);
  else if (phase === 'end') renderEnd(c);
}

function renderJoin(parent){
  const card = el('div','card center');
  const input = el('input',''); input.type='text'; input.placeholder='';
  input.addEventListener('input', ()=>{ if (input.value.trim().length>=2) advanceBtn.classList.remove('hidden'); else advanceBtn.classList.add('hidden'); });
  const advanceBtn = el('button','btn-green hidden','avançar');
  advanceBtn.addEventListener('click', ()=>{ socket.emit('join',{deviceName:input.value.trim()}); myRole='visitor'; });
  card.appendChild(input); card.appendChild(el('div','spacer'));
  card.appendChild(advanceBtn);

  // role selection
  const row = el('div','row');
  const visitorBtn = el('button','','Visitante');
  const adminBtn = el('button','','Admin');
  visitorBtn.addEventListener('click', ()=>{ socket.emit('chooseRole',{role:'visitor'}); myRole='visitor'; });
  adminBtn.addEventListener('click', ()=>{
    const pass = prompt('senha');
    socket.emit('chooseRole',{role:'admin', password:pass});
    if (pass === '12345678') myRole='admin';
  });
  card.appendChild(row);
  row.appendChild(visitorBtn); row.appendChild(adminBtn);
  parent.appendChild(card);
}

function renderCategories(parent){
  const card = el('div','card');
  const title = el('div','title',''); card.appendChild(title);
  const wrap = el('div','center');
  const grid = el('div','');
  (state.availableCategories || []).forEach(cat=>{
    const b = el('button','category',cat);
    b.addEventListener('click', ()=>{ if (state.players[myId]?.role==='admin') socket.emit('selectCategory',{category:cat}); });
    grid.appendChild(b);
  });
  wrap.appendChild(grid);
  const fin = el('button','btn-purple','finalizar');
  fin.addEventListener('click', ()=>{
    if (state.players[myId]?.role==='admin'){
      const ok = confirm('deseja mesmo encerrar?');
      socket.emit('finalizeGame',{confirm:ok});
    }
  });
  wrap.appendChild(fin);
  card.appendChild(wrap);
  parent.appendChild(card);
}

function renderPrepare(parent){
  const card = el('div','card center');
  const info = el('div','title','');
  const p = state.currentTurn?.playerSocket ? (state.players[state.currentTurn.playerSocket]?.name || '') : '';
  info.textContent = `preparar ${p}`;
  card.appendChild(info);
  const startBtn = el('button','btn-green','iniciar');
  if (state.currentTurn?.playerSocket !== myId) startBtn.disabled = true;
  startBtn.addEventListener('click', ()=>{ socket.emit('startTurn'); socket.emit('submitWordRequest'); });
  card.appendChild(startBtn);
  parent.appendChild(card);
}

function renderTurn(parent){
  // chosen player sees full interface
  const isChosen = state.currentTurn?.playerSocket === myId;
  if (isChosen) renderTurnActive(parent);
  else renderTurnObserver(parent);
}

function renderTurnActive(parent){
  const card = el('div','card center');
  const timerDiv = el('div','timer','--');
  card.appendChild(timerDiv);
  const wordDiv = el('div','word', currentWord || '');
  card.appendChild(wordDiv);
  const controls = el('div','controls');
  const right = el('button','circle btn-big btn-green','acertou');
  const skip = el('button','circle btn-big btn-green','pular'); skip.style.background='#e53935';
  // Correct
  right.addEventListener('click', ()=>{ socket.emit('correct'); });
  skip.addEventListener('click', ()=>{ socket.emit('skip'); });
  controls.appendChild(right); controls.appendChild(skip);
  card.appendChild(controls);
  parent.appendChild(card);
}

function renderTurnObserver(parent){
  const card = el('div','card center');
  const timerDiv = el('div','timer','--'); card.appendChild(timerDiv);
  parent.appendChild(card);
}

function renderReview(parent){
  const card = el('div','card');
  const grid = el('div','words-grid');
  (state.roundWords || []).forEach(w=>{
    const wc = el('div','word-card', w.word);
    wc.classList.add(w.status==='correct'? 'correct':'skipped');
    grid.appendChild(wc);
  });
  card.appendChild(grid);
  const adv = el('button','btn-green','avançar');
  // only admin
  if (state.players[myId]?.role!=='admin') adv.disabled = true;
  adv.addEventListener('click', ()=>{ socket.emit('finishReview'); });
  card.appendChild(adv);
  parent.appendChild(card);
}

function renderEnd(parent){
  const card = el('div','card center');
  const s = el('div','title','placar final');
  const t1 = `${state.teamNames?.team1||'Equipe 1'}: ${state.scores?.team1||0}`;
  const t2 = `${state.teamNames?.team2||'Equipe 2'}: ${state.scores?.team2||0}`;
  card.appendChild(s);
  card.appendChild(el('div','',''+t1));
  card.appendChild(el('div','',''+t2));
  parent.appendChild(card);
}

function showSkipping(){
  // hide interface for chosen player for 3s (client side) — server triggers word changes
  currentWord = 'pulando...'; render();
}

function startLocalTimer(endAt){
  if (timerInterval) clearInterval(timerInterval);
  function tick(){
    const now = Date.now();
    const rem = Math.max(0, Math.round((endAt - now)/1000));
    document.querySelectorAll('.timer').forEach(d=>d.textContent = rem);
    // hide skip button at <=5
    if (rem <=5){ document.querySelectorAll('button').forEach(b=>{ if (b.textContent && b.textContent.toLowerCase().includes('pular')) b.style.display='none'; }); }
    if (rem<=0){ clearInterval(timerInterval); socket.emit('endTurn'); }
  }
  tick();
  timerInterval = setInterval(tick, 300);
}

// Drag & drop for admin team allocation
let dragId = null;

document.addEventListener('click', (e)=>{
  // global click handler to populate lobby/team lists when rendering
  const lists = document.querySelectorAll('.section');
});

// Before unload warning
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});

render();

// Periodically request full state in case of missed updates
setInterval(()=>socket.emit('noop'), 5000);