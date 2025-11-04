// public/client.js
const socket = io();
let myId = null;
let myName = null;
let amAdmin = false;
const popup = document.getElementById('popup');
const enterBtn = document.getElementById('enterBtn');
const nameInput = document.getElementById('nameInput');
const app = document.getElementById('app');
const youName = document.getElementById('youName');
const adminBadge = document.getElementById('adminBadge');
const startScreen = document.getElementById('startScreen');
const teamAInput = document.getElementById('teamA');
const teamBInput = document.getElementById('teamB');
const passwordInput = document.getElementById('password');
const startGameBtn = document.getElementById('startGameBtn');
const adminPanel = document.getElementById('adminPanel');
const categorySelect = document.getElementById('categorySelect');
const playerSelect = document.getElementById('playerSelect');
const teamSelect = document.getElementById('teamSelect');
const startRoundBtn = document.getElementById('startRoundBtn');
const resetBtn = document.getElementById('resetBtn');
const playersList = document.getElementById('playersList');
const scoresDiv = document.getElementById('scores');
const roundPanel = document.getElementById('roundPanel');
const roundInfo = document.getElementById('roundInfo');
const wordArea = document.getElementById('wordArea');
const currentWord = document.getElementById('currentWord');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const remotePlaying = document.getElementById('remotePlaying');
const whoPlaying = document.getElementById('whoPlaying');
const acertadasList = document.getElementById('acertadasList');
const puladasList = document.getElementById('puladasList');
const gameTimer = document.getElementById('gameTimer');
const timeLeft = document.getElementById('timeLeft');
enterBtn.addEventListener('click', ()=>{
  const name = nameInput.value.trim() || 'Jogador';
  myName = name.slice(0,30);
  popup.classList.remove('active');
  popup.classList.add('hidden');
  app.classList.remove('hidden');
  youName.textContent = myName;
  socket.emit('join', myName);
});
startGameBtn.addEventListener('click', ()=>{
  const a = teamAInput.value.trim();
  const b = teamBInput.value.trim();
  const pwd = passwordInput.value;
  socket.emit('startGame', { teamA: a, teamB: b, password: pwd });
  startScreen.classList.add('hidden');
});
startRoundBtn.addEventListener('click', ()=>{
  const cat = categorySelect.value;
  const playerId = playerSelect.value;
  const team = teamSelect.value;
  socket.emit('startRound', { category: cat, playerId, team });
});
resetBtn.addEventListener('click', ()=>{ socket.emit('adminReset'); });
correctBtn.addEventListener('click', ()=>{ socket.emit('correct'); });
skipBtn.addEventListener('click', ()=>{ socket.emit('skip'); });
socket.on('connect', ()=>{ myId = socket.id; socket.emit('requestState'); });
socket.on('categories', (cats)=>{
  categorySelect.innerHTML = '';
  cats.forEach(c=>{
    const o = document.createElement('option'); o.value = c; o.textContent = c; categorySelect.appendChild(o);
  });
});
socket.on('adminAssigned', ()=>{
  amAdmin = true;
  adminBadge.classList.remove('hidden');
  adminPanel.classList.remove('hidden');
});
socket.on('state', (s)=>{
  playersList.innerHTML = '';
  playerSelect.innerHTML = '';
  Object.values(s.players).forEach(p=>{
    const li = document.createElement('li'); li.textContent = p.name + (p.isAdmin ? ' (admin)' : ''); playersList.appendChild(li);
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name; playerSelect.appendChild(opt);
    if(p.id === myId) myName = p.name;
  });
  scoresDiv.innerHTML = '';
  Object.keys(s.scores||{}).forEach(k=>{
    const d = document.createElement('div'); d.className='scoreItem'; d.innerHTML = `<strong>${k}</strong><div class="small">${s.scores[k]||0} pts</div>`; scoresDiv.appendChild(d);
  });
  teamSelect.innerHTML = '';
  const t1 = document.createElement('option'); t1.value = s.teamNames ? s.teamNames[0] : 'Equipe A'; t1.textContent = t1.value; teamSelect.appendChild(t1);
  const t2 = document.createElement('option'); t2.value = s.teamNames ? s.teamNames[1] : 'Equipe B'; t2.textContent = t2.value; teamSelect.appendChild(t2);
  acertadasList.innerHTML = '';
  puladasList.innerHTML = '';
  (s.acertadas||[]).forEach(a=>{ const li=document.createElement('li'); li.textContent = `${a.word} — ${a.player} (${a.team})`; acertadasList.appendChild(li); });
  (s.puladas||[]).forEach(p=>{ const li=document.createElement('li'); li.textContent = `${p.word} — ${p.player} (${p.team})`; puladasList.appendChild(li); });
  if(s.gameStarted){
    startScreen.classList.add('hidden');
    const startedAt = s.gameStartTime;
    if(startedAt){
      const ends = startedAt + 3600*1000;
      const rem = Math.max(0, ends - Date.now());
      updateGlobalTimer(rem);
    }
  }
  if(s.currentRound && s.currentRound.roundActive){
    roundPanel.classList.remove('hidden');
    roundInfo.textContent = `Jogando: ${s.currentRound.playerName} — ${s.currentRound.category} — ${s.currentRound.team}`;
    if(s.currentRound.playerId === myId){
      wordArea.classList.remove('hidden');
      remotePlaying.classList.add('hidden');
    } else {
      wordArea.classList.add('hidden');
      remotePlaying.classList.remove('hidden');
      whoPlaying.textContent = `${s.currentRound.playerName}`;
    }
  } else {
    roundPanel.classList.add('hidden');
  }
});
socket.on('roundStarted', (info)=>{
  roundPanel.classList.remove('hidden');
  roundInfo.textContent = `Jogando: ${info.playerName} — ${info.category} — ${info.team}`;
  if(info.playerId === myId){
    wordArea.classList.remove('hidden');
    remotePlaying.classList.add('hidden');
  } else {
    wordArea.classList.add('hidden');
    remotePlaying.classList.remove('hidden');
    whoPlaying.textContent = `${info.playerName}`;
  }
  if(info.endsAt){
    const rem = Math.max(0, info.endsAt - Date.now());
    updateRoundTimer(rem);
  }
});
socket.on('newWord', ({word})=>{
  currentWord.textContent = word || '—';
  wordArea.classList.remove('hidden');
  remotePlaying.classList.add('hidden');
});
socket.on('noWord', ()=>{
  currentWord.textContent = 'Sem palavras restantes';
});
socket.on('updateLists', (d)=>{
  acertadasList.innerHTML=''; puladasList.innerHTML='';
  (d.acertadas||[]).forEach(a=>{ const li=document.createElement('li'); li.textContent = `${a.word} — ${a.player} (${a.team})`; acertadasList.appendChild(li); });
  (d.puladas||[]).forEach(p=>{ const li=document.createElement('li'); li.textContent = `${p.word} — ${p.player} (${p.team})`; puladasList.appendChild(li); });
  scoresDiv.innerHTML=''; Object.keys(d.scores||{}).forEach(k=>{ const dd=document.createElement('div'); dd.className='scoreItem'; dd.innerHTML = `<strong>${k}</strong><div class="small">${d.scores[k]||0} pts</div>`; scoresDiv.appendChild(dd); });
});
socket.on('skipping', (info)=>{
  if(info.playerId === myId){
    currentWord.textContent = 'pulando...';
  } else {
    whoPlaying.textContent = `${info.playerName} (pulando...)`;
  }
});
socket.on('roundEnded', ()=>{
  roundPanel.classList.add('hidden');
});
socket.on('gameReset', ()=>{
  location.reload();
});
function updateRoundTimer(sec){
  clearInterval(window._roundTimer);
  const el = timeLeft;
  el.textContent = `Tempo restante do round: ${formatSec(sec)}`;
  if(sec<=0) return;
  let t = sec;
  window._roundTimer = setInterval(()=>{
    t--; if(t<0){ clearInterval(window._roundTimer); el.textContent=''; return; }
    el.textContent = `Tempo restante do round: ${formatSec(t)}`;
  },1000);
}
function updateGlobalTimer(ms){
  clearInterval(window._globalTimer);
  const el = gameTimer;
  let t = Math.floor(ms/1000);
  if(t<=0){ el.textContent='00:00:00'; return;}
  el.textContent = `Tempo de jogo: ${formatHMS(t)}`;
  window._globalTimer = setInterval(()=>{
    t--; if(t<0){ clearInterval(window._globalTimer); gameTimer.textContent=''; return;}
    el.textContent = `Tempo de jogo: ${formatHMS(t)}`;
  },1000);
}
function formatSec(s){ const mm = Math.floor(s/60); const ss = s%60; return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
function formatHMS(s){ const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
