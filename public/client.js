const socket = io();
let myId = null;
let isAdmin = false;
let currentScreen = 1;
let selectedRadioPlayer = null;
let currentWord = null;
let countdownInterval = null;
let remaining = 0;
let activeRoundPlayerId = null;

const el = id => document.getElementById(id);

function showScreen(n, extra){
  currentScreen = n;
  [1,2,3,4].forEach(i => {
    const s = el('screen'+i);
    if(s) s.classList.toggle('active', i===n);
  });
  if(n===1){
    clearRoundUI();
  }
  if(n===2){
    renderCategories(extra && extra.categories ? extra.categories : null);
  }
  if(n===3){
    startLocalCountdown(extra && extra.duration ? extra.duration : 75000);
  }
}

function clearRoundUI(){
  el('wordLarge').textContent = '...';
  el('resultsWrap').innerHTML = '';
  stopCountdown();
}

function stopCountdown(){
  if(countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

function startLocalCountdown(ms){
  remaining = Math.ceil(ms/1000);
  el('timer').textContent = remaining;
  if(countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(()=>{
    remaining--;
    if(remaining<0){ clearInterval(countdownInterval); countdownInterval=null; return;}
    el('timer').textContent = remaining;
  },1000);
  requestWord();
}

function requestWord(){
  socket.emit('requestWord');
}

function renderPlayers(players){
  const ul = el('playersUl');
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.isAdmin ? ' (admin)' : '') + (p.team ? ' • ' + (p.team==='team1'?'Equipe 1':'Equipe 2') : '');
    ul.appendChild(li);
  });
  const radiosWrap = el('playersRadiosWrap');
  radiosWrap.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('label');
    div.className = 'playerRadio';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'playerRadio';
    r.value = p.id;
    r.onclick = ()=> selectedRadioPlayer = p.id;
    div.appendChild(r);
    const span = document.createElement('span');
    span.textContent = p.name + (p.isAdmin ? ' (admin)' : '');
    div.appendChild(span);
    radiosWrap.appendChild(div);
  });
}

function renderCategories(list){
  const wrap = el('categoriesWrap');
  wrap.innerHTML = '';
  const cats = list || [
    {key:"animais",label:"animais"},
    {key:"tv_cinema",label:"tv e cinema"},
    {key:"objetos",label:"objetos"},
    {key:"lugares",label:"lugares"},
    {key:"pessoas",label:"pessoas"},
    {key:"esportes_jogos",label:"esportes e jogos"},
    {key:"profissoes",label:"profissões"},
    {key:"alimentos",label:"alimentos"},
    {key:"personagens",label:"personagens"},
    {key:"biblico",label:"bíblico"}
  ];
  cats.forEach(c=>{
    const b = document.createElement('button');
    b.className = 'catBtn';
    b.textContent = c.label;
    b.onclick = ()=> socket.emit('selectCategory', c.key);
    wrap.appendChild(b);
  });
}

el('team1').onclick = ()=> {
  socket.emit('joinTeam','team1');
};
el('team2').onclick = ()=> {
  socket.emit('joinTeam','team2');
};
el('btnCategorias').onclick = ()=> {
  socket.emit('showCategories');
};
el('btnCategoriasAfter').onclick = ()=> {
  socket.emit('showCategories');
};
el('btnBackFrom2').onclick = ()=> {
  showScreen(1);
};
el('btnStartRound').onclick = ()=> {
  if(!selectedRadioPlayer) return;
  socket.emit('startRound', selectedRadioPlayer);
};
el('btnAcertou').onclick = ()=> {
  socket.emit('acertou');
};
el('btnPular').onclick = ()=> {
  el('wordLarge').textContent = 'pulando...';
  socket.emit('pular');
};

el('nameInput').addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    const name = el('nameInput').value || '';
    socket.emit('join',{name});
    el('nameInput').blur();
  }
});

socket.on('connect', ()=>{
  myId = socket.id;
});

socket.on('state', data=>{
  renderPlayers(data.players);
  el('score1').textContent = data.scores.team1 || 0;
  el('score2').textContent = data.scores.team2 || 0;
});

socket.on('showScreen', (n, extra)=>{
  if(n===2){
    showScreen(2, extra || {});
  } else if(n===3){
    showScreen(3, extra || {});
  } else if(n===1){
    showScreen(1);
  }
});

socket.on('selectedRoundPlayer', id=>{
  activeRoundPlayerId = id;
});

socket.on('word', w=>{
  currentWord = w;
  el('wordLarge').textContent = w;
});

socket.on('noWord', ()=>{
  el('wordLarge').textContent = 'sem palavras restantes';
});

socket.on('scores', s=>{
  el('score1').textContent = s.team1 || 0;
  el('score2').textContent = s.team2 || 0;
});

socket.on('roundEnded', summary=>{
  stopCountdown();
  showScreen(4);
  const wrap = el('resultsWrap');
  wrap.innerHTML = '';
  const used = summary.usedWords || [];
  used.forEach(u=>{
    const parts = u.split('||');
    const cat = parts[0];
    const word = parts[1];
    const div = document.createElement('div');
    div.className = 'resultWord ok';
    div.textContent = word + ' • ' + cat;
    wrap.appendChild(div);
  });
  el('score1').textContent = summary.scores.team1 || 0;
  el('score2').textContent = summary.scores.team2 || 0;
});

socket.on('resetToScreen1', ()=>{
  showScreen(1);
  el('nameInput').value = '';
  renderPlayers([]);
  el('score1').textContent = '0';
  el('score2').textContent = '0';
});

window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});
