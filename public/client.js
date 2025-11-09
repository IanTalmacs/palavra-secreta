// public/client.js
const socket = io();
const initialDiv = document.getElementById('initial');
const mainDiv = document.getElementById('main');
const startBtn = document.getElementById('startBtn');
const team1Input = document.getElementById('team1');
const team2Input = document.getElementById('team2');
const passwordInput = document.getElementById('password');
const startMsg = document.getElementById('startMsg');
const teamAName = document.getElementById('teamAName');
const teamBName = document.getElementById('teamBName');
const teamAScore = document.getElementById('teamAScore');
const teamBScore = document.getElementById('teamBScore');
const categorySelect = document.getElementById('categorySelect');
const teamSelect = document.getElementById('teamSelect');
const startRoundBtn = document.getElementById('startRoundBtn');
const roundOverlay = document.getElementById('roundOverlay');
const wordBox = document.getElementById('wordBox');
const correctBtn = document.getElementById('correctBtn');
const skipBtn = document.getElementById('skipBtn');
const skipText = document.getElementById('skipText');
const timeLeft = document.getElementById('timeLeft');
const resetAll = document.getElementById('resetAll');
const remainingDiv = document.getElementById('remaining');
let roundTimerInterval = null;
let roundEndTime = null;
let roundActive = false;
let currentCategory = null;
socket.on('init', ({ started, teams, scores, categories, remaining })=>{
  populateCategories(categories || []);
  updateScores(scores || {a:0,b:0});
  setTeams(teams || {a:'Equipe A', b:'Equipe B'});
  if(started){ initialDiv.classList.add('hidden'); mainDiv.classList.remove('hidden'); } else { initialDiv.classList.remove('hidden'); mainDiv.classList.add('hidden'); }
  updateRemaining(remaining || 0);
});
socket.on('gameStarted', ({ teams, scores, remaining })=>{
  initialDiv.classList.add('hidden');
  mainDiv.classList.remove('hidden');
  setTeams(teams);
  updateScores(scores);
  updateRemaining(remaining);
});
socket.on('gameReset', ()=> {
  initialDiv.classList.remove('hidden');
  mainDiv.classList.add('hidden');
  stopRoundUI();
});
socket.on('scoreUpdate', (scores)=> updateScores(scores));
socket.on('state', ({ started, teams, scores, remaining })=>{
  setTeams(teams);
  updateScores(scores);
  if(started){ initialDiv.classList.add('hidden'); mainDiv.classList.remove('hidden'); } else { initialDiv.classList.remove('hidden'); mainDiv.classList.add('hidden'); }
  updateRemaining(remaining || 0);
});
socket.on('roundStarted', ({ word, duration })=>{
  startRoundUI(word, duration);
});
socket.on('newWord', ({ word })=>{
  setWord(word);
});
socket.on('noWords', ()=>{
  setWord('acabaram as palavras');
  setTimeout(()=> endRoundClient(), 1200);
});
socket.on('roundEnded', ()=> {
  endRoundClient();
});
socket.on('startFailed', ()=> {
  startMsg.textContent = 'Senha incorreta ou jogo já iniciado';
  setTimeout(()=> startMsg.textContent = '', 2500);
});
function populateCategories(categories){
  categorySelect.innerHTML = '';
  (categories || []).forEach(c=>{
    const o = document.createElement('option'); o.value = c; o.textContent = c; categorySelect.appendChild(o);
  });
  currentCategory = categorySelect.value;
}
function setTeams(teams){
  teamAName.textContent = teams.a || 'Equipe A';
  teamBName.textContent = teams.b || 'Equipe B';
  const aOpt = teamSelect.querySelector('option[value="a"]');
  const bOpt = teamSelect.querySelector('option[value="b"]');
  aOpt.textContent = teams.a || 'Equipe A';
  bOpt.textContent = teams.b || 'Equipe B';
}
function updateScores(scores){
  teamAScore.textContent = (scores.a || 0);
  teamBScore.textContent = (scores.b || 0);
}
startBtn.addEventListener('click', ()=>{
  const t1 = team1Input.value.trim() || 'Equipe A';
  const t2 = team2Input.value.trim() || 'Equipe B';
  const pw = passwordInput.value;
  socket.emit('startGame', { team1: t1, team2: t2, password: pw });
});
startRoundBtn.addEventListener('click', ()=>{
  const category = categorySelect.value;
  const team = teamSelect.value;
  socket.emit('startRound', { category, team });
});
correctBtn.addEventListener('click', ()=>{
  if(!roundActive) return;
  const team = teamSelect.value;
  socket.emit('roundCorrect', { team });
});
skipBtn.addEventListener('click', ()=>{
  if(!roundActive) return;
  skipText.textContent = 'pulando...';
  socket.emit('roundSkip');
  setTimeout(()=> skipText.textContent = '', 3000);
});
resetAll.addEventListener('click', ()=>{
  socket.emit('resetGame');
});
function startRoundUI(word, duration){
  roundActive = true;
  roundOverlay.classList.remove('hidden');
  setWord(word);
  roundEndTime = Date.now() + duration*1000;
  timeLeft.textContent = Math.ceil((roundEndTime - Date.now())/1000);
  if(roundTimerInterval) clearInterval(roundTimerInterval);
  roundTimerInterval = setInterval(()=>{
    const sec = Math.ceil((roundEndTime - Date.now())/1000);
    if(sec <= 0){
      timeLeft.textContent = '0';
      clearInterval(roundTimerInterval);
      roundTimerInterval = null;
      endRoundClient();
    } else {
      timeLeft.textContent = sec;
    }
  }, 250);
}
function setWord(word){
  wordBox.textContent = word || '';
}
function endRoundClient(){
  roundActive = false;
  roundOverlay.classList.add('hidden');
  if(roundTimerInterval){ clearInterval(roundTimerInterval); roundTimerInterval = null; }
}
function stopRoundUI(){
  roundActive = false;
  roundOverlay.classList.add('hidden');
  if(roundTimerInterval){ clearInterval(roundTimerInterval); roundTimerInterval = null; }
}
function updateRemaining(ms){
  if(!ms || ms<=0){ remainingDiv.textContent = ''; return; }
  const s = Math.ceil(ms/1000);
  const mins = Math.floor(s/60);
  const secs = s%60;
  remainingDiv.textContent = `Tempo restante: ${mins}m ${secs}s`;
  setTimeout(()=> {
    socket.emit('requestState');
  }, 1000);
}
setInterval(()=> { socket.emit('requestState'); }, 5000);
