const socket = io()
let myId = null
let isAdmin = false
let myName = ''
const categories = [
  {key:'animais', label:'animais'},
  {key:'tv_cinema', label:'tv e cinema'},
  {key:'objetos', label:'objetos'},
  {key:'lugares', label:'lugares'},
  {key:'pessoas', label:'pessoas'},
  {key:'esportes_e_jogos', label:'esportes e jogos'},
  {key:'profissoes', label:'profissões'},
  {key:'alimentos', label:'alimentos'},
  {key:'personagens', label:'personagens'},
  {key:'biblico', label:'bíblico'}
]
const popup = document.getElementById('popup')
const enterBtn = document.getElementById('enterBtn')
const nameInput = document.getElementById('nameInput')
const app = document.getElementById('app')
const initialScreen = document.getElementById('initialScreen')
const startGameBtn = document.getElementById('startGameBtn')
const team1Input = document.getElementById('team1')
const team2Input = document.getElementById('team2')
const startPassword = document.getElementById('startPassword')
const playersList = document.getElementById('playersList')
const playerSelect = document.getElementById('playerSelect')
const teamSelect = document.getElementById('teamSelect')
const categorySelect = document.getElementById('categorySelect')
const adminPanel = document.getElementById('adminPanel')
const notAdmin = document.getElementById('notAdmin')
const startRoundBtn = document.getElementById('startRoundBtn')
const resetBtn = document.getElementById('resetBtn')
const scoresDiv = document.getElementById('scores')
const historyList = document.getElementById('history')
const gameArea = document.getElementById('gameArea')
const roundUI = document.getElementById('roundUI')
const roundWord = document.getElementById('roundWord')
const hitBtn = document.getElementById('hitBtn')
const skipBtn = document.getElementById('skipBtn')
const skipOverlay = document.getElementById('skipOverlay')
const timerDiv = document.getElementById('timer')
enterBtn.addEventListener('click', ()=>{
  const v = nameInput.value.trim()
  if(!v) return
  myName = v
  socket.emit('setName', v)
  popup.classList.add('hidden')
  app.classList.remove('hidden')
})
startGameBtn.addEventListener('click', ()=>{
  socket.emit('startGame',{team1:team1Input.value||'Equipe 1', team2:team2Input.value||'Equipe 2', password:startPassword.value})
})
startRoundBtn.addEventListener('click', ()=>{
  const playerId = playerSelect.value
  const category = categorySelect.value
  const team = teamSelect.value
  if(!playerId || !category || !team) return
  socket.emit('startRound',{playerId, category, team})
})
resetBtn.addEventListener('click', ()=>{ socket.emit('resetGame') })
hitBtn.addEventListener('click', ()=>{ socket.emit('hit') })
skipBtn.addEventListener('click', ()=>{ socket.emit('skip'); showSkipOverlay() })
function showSkipOverlay(){ skipOverlay.classList.remove('hidden'); setTimeout(()=>skipOverlay.classList.add('hidden'),3000) }
function renderPlayers(list){
  playersList.innerHTML = ''
  playerSelect.innerHTML = '<option value="">Selecione</option>'
  list.forEach(p=>{
    const li = document.createElement('li')
    li.textContent = p.name
    playersList.appendChild(li)
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.name
    playerSelect.appendChild(opt)
  })
}
function renderCategories(){
  categorySelect.innerHTML = ''
  categories.forEach(c=>{
    const opt = document.createElement('option')
    opt.value = c.key
    opt.textContent = c.label
    categorySelect.appendChild(opt)
  })
}
function renderTeams(ts){
  teamSelect.innerHTML = ''
  ts.forEach(t=>{
    const opt = document.createElement('option')
    opt.value = t
    opt.textContent = t
    teamSelect.appendChild(opt)
  })
}
function renderScores(scores){
  scoresDiv.innerHTML = ''
  Object.keys(scores||{}).forEach(k=>{
    const d = document.createElement('div')
    d.className = 'scoreCard'
    d.innerHTML = `<div>${k}</div><div style="font-weight:800;font-size:20px">${scores[k]}</div>`
    scoresDiv.appendChild(d)
  })
}
function renderHistory(h){
  historyList.innerHTML = ''
  (h||[]).slice().reverse().forEach(item=>{
    const li = document.createElement('li')
    const t = new Date(item.timestamp).toLocaleTimeString()
    li.textContent = `${item.word} — ${item.result} • ${item.player} • ${item.team} • ${t}`
    historyList.appendChild(li)
  })
}
socket.on('connect', ()=>{ myId = socket.id })
socket.on('players', list=> renderPlayers(list))
socket.on('youAreAdmin', ()=>{ isAdmin = true; adminPanel.classList.remove('hidden'); notAdmin.classList.add('hidden') })
socket.on('adminDisconnected', ()=>{ isAdmin = false; adminPanel.classList.add('hidden'); notAdmin.classList.remove('hidden') })
socket.on('startFailed', ()=>{ alert('Senha incorreta') })
socket.on('gameStarted', data=>{
  initialScreen.classList.add('hidden')
  gameArea.classList.remove('hidden')
  renderTeams(data.teams)
  renderScores({})
})
socket.on('state', s=>{
  if(!s.gameStarted){ initialScreen.classList.remove('hidden'); gameArea.classList.add('hidden') } else { initialScreen.classList.add('hidden'); gameArea.classList.remove('hidden') }
  renderScores(s.scores||{})
  renderHistory(s.wordHistory||[])
  renderPlayers(s.players||[])
  if(s.teams && s.teams.length) renderTeams(s.teams)
  updateTimer(s.startTime)
})
socket.on('roundStarted', data=>{
  if(data.playerId === socket.id){
    roundUI.classList.remove('hidden')
  } else {
    roundUI.classList.add('hidden')
  }
})
socket.on('roundWord', data=>{
  if(data.word === null){ roundWord.textContent = 'Sem palavras disponíveis'; return }
  roundWord.textContent = data.word
})
socket.on('roundEnded', ()=>{
  roundUI.classList.add('hidden')
})
socket.on('scoreUpdate', s=> renderScores(s))
socket.on('wordHistory', h=> renderHistory(h))
socket.on('skipStarted', ()=>{ /* visual handled locally */ })
renderCategories()
setInterval(()=>{ if(!document.hidden) socket.emit('requestState') },5000)
function updateTimer(startTime){
  if(!startTime){ timerDiv.textContent = '' ; return }
  const end = startTime + 3600000
  const rem = Math.max(0, end - Date.now())
  const m = Math.floor(rem/60000)
  const s = Math.floor((rem%60000)/1000)
  timerDiv.textContent = `Tempo restante: ${m}m ${s}s`
}
setInterval(()=>socket.emit('requestState'),1000)
