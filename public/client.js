const socket = io()
let myId = null
let myName = ''
let isAdmin = false
let currentRound = null
const nameScreen = document.getElementById('nameScreen')
const playerNameInput = document.getElementById('playerName')
const btnEnter = document.getElementById('btnEnter')
const initialScreen = document.getElementById('initialScreen')
const btnStart = document.getElementById('btnStart')
const teamAInput = document.getElementById('teamA')
const teamBInput = document.getElementById('teamB')
const startPassword = document.getElementById('startPassword')
const lobby = document.getElementById('lobby')
const playersList = document.getElementById('playersList')
const teamAName = document.getElementById('teamAName')
const teamBName = document.getElementById('teamBName')
const teamAScore = document.getElementById('teamAScore')
const teamBScore = document.getElementById('teamBScore')
const guessedList = document.getElementById('guessedList')
const skippedList = document.getElementById('skippedList')
const adminPanel = document.getElementById('adminPanel')
const selectPlayer = document.getElementById('selectPlayer')
const selectCategory = document.getElementById('selectCategory')
const selectTeam = document.getElementById('selectTeam')
const btnStartRound = document.getElementById('btnStartRound')
const btnReset = document.getElementById('btnReset')
const roundArea = document.getElementById('roundArea')
const playerTurnUI = document.getElementById('playerTurnUI')
const spectatorUI = document.getElementById('spectatorUI')
const wordCard = document.getElementById('wordCard')
const btnCorrect = document.getElementById('btnCorrect')
const btnSkip = document.getElementById('btnSkip')
const skipLabel = document.getElementById('skipLabel')
const roundInfo = document.getElementById('roundInfo')
const spectatorText = document.getElementById('spectatorText')
const countdown = document.getElementById('countdown')
const spectatorCountdown = document.getElementById('spectatorCountdown')
const timerDisplay = document.getElementById('timer')
const categories = ["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissoes","alimentos","personagens","biblico"]
function show(el){ el.classList.remove('hidden') }
function hide(el){ el.classList.add('hidden') }
function createOption(value,text){ const o = document.createElement('option'); o.value = value; o.textContent = text; return o }
categories.forEach(c=>selectCategory.appendChild(createOption(c,c)))
btnEnter.onclick = ()=>{
  const name = playerNameInput.value.trim() || 'Anon'
  myName = name
  socket.emit('register',name)
  nameScreen.classList.remove('visible')
  nameScreen.classList.add('hidden')
}
btnStart.onclick = ()=>{
  const teamA = teamAInput.value.trim() || 'Equipe A'
  const teamB = teamBInput.value.trim() || 'Equipe B'
  const password = startPassword.value.trim()
  socket.emit('startGame',{teamA,teamB,password})
}
btnStartRound.onclick = ()=>{
  const playerId = selectPlayer.value
  const category = selectCategory.value
  const teamKey = selectTeam.value
  socket.emit('startRound',{playerId,category,teamKey})
}
btnReset.onclick = ()=>{ socket.emit('resetGame') }
btnCorrect.onclick = ()=>{ socket.emit('correct') }
btnSkip.onclick = ()=>{ socket.emit('skip') }
socket.on('connect',()=>{
  myId = socket.id
})
socket.on('players',(players)=>{
  playersList.innerHTML = ''
  selectPlayer.innerHTML = ''
  players.forEach(p=>{
    const d = document.createElement('div')
    d.textContent = p.name
    playersList.appendChild(d)
    const o = createOption(p.id,p.name)
    selectPlayer.appendChild(o)
  })
})
socket.on('gameState',(state)=>{
  isAdmin = state.admin
  if(state.started) {
    hide(initialScreen)
    show(lobby)
    show(roundArea)
    if(isAdmin) show(adminPanel)
    else hide(adminPanel)
  }
  updateScores(state.teams)
  renderLists(state.guessedWords,state.skippedWords)
  if(state.currentRound){
    renderRoundInfo(state.currentRound)
  }
  if(state.expiresAt){
    startExpiry(state.expiresAt)
  }
})
socket.on('gameStarted',(data)=>{
  hide(initialScreen)
  show(lobby)
  show(roundArea)
  if(socket.id === data.adminAssigned && !isAdmin){
    isAdmin = socket.id === data.adminAssigned
  }
  if(isAdmin) show(adminPanel)
  updateScores(data.teams)
})
socket.on('updateScores',(data)=>{
  updateScores(data.teams)
  renderLists(data.guessed,data.skipped)
})
socket.on('roundInfo',(info)=>{
  roundInfo.textContent = `${info.player.name} - ${info.category} - ${info.teamKey}`
  spectatorText.textContent = `${info.player.name} está jogando para ${info.teamKey}`
  show(spectatorUI)
  startRoundCountdown(info.endTime)
})
socket.on('yourTurn',(data)=>{
  currentRound = {endTime:data.endTime}
  wordCard.textContent = data.word || '---'
  show(playerTurnUI)
  hide(spectatorUI)
  startRoundCountdown(data.endTime)
})
socket.on('nextWord',(data)=>{
  wordCard.textContent = data.word || '---'
  skipLabel.classList.remove('show')
  btnCorrect.disabled = false
  btnSkip.disabled = false
})
socket.on('skipping',()=>{
  skipLabel.classList.add('show')
  btnCorrect.disabled = true
  btnSkip.disabled = true
})
socket.on('roundEnded',(data)=>{
  updateScores(data.teams)
  renderLists(data.guessed,data.skipped)
  hide(playerTurnUI)
  show(spectatorUI)
  roundInfo.textContent = 'Round encerrado'
  countdown.textContent = ''
  spectatorCountdown.textContent = ''
  currentRound = null
})
socket.on('resetAll',()=>{
  location.reload()
})
function updateScores(teams){
  if(!teams) return
  teamAName.textContent = teams.teamA.name
  teamBName.textContent = teams.teamB.name
  teamAScore.textContent = teams.teamA.score
  teamBScore.textContent = teams.teamB.score
}
function renderLists(guessed,skipped){
  guessedList.innerHTML = ''
  skippedList.innerHTML = ''
  (guessed||[]).forEach(g=>{
    const li = document.createElement('li')
    li.textContent = `${g.word} • ${g.player} (${g.team})`
    guessedList.appendChild(li)
  })
  (skipped||[]).forEach(s=>{
    const li = document.createElement('li')
    li.textContent = `${s.word} • ${s.player} (${s.team})`
    skippedList.appendChild(li)
  })
}
function renderRoundInfo(cr){
  if(!cr) return
  roundInfo.textContent = `${cr.playerId} - ${cr.category}`
}
function startRoundCountdown(endTime){
  clearInterval(window._roundInterval)
  function tick(){
    const t = Math.max(0,Math.floor((endTime-Date.now())/1000))
    countdown.textContent = `${t}s`
    spectatorCountdown.textContent = `${t}s`
    if(t<=0){ clearInterval(window._roundInterval) }
  }
  tick()
  window._roundInterval = setInterval(tick,250)
}
function startExpiry(expiresAt){
  clearInterval(window._expiryInterval)
  function tick(){
    const remaining = Math.max(0,Math.floor((expiresAt-Date.now())/1000))
    const h = Math.floor(remaining/3600)
    const m = Math.floor((remaining%3600)/60)
    const s = remaining%60
    timerDisplay.textContent = `expira em ${h}h ${m}m ${s}s`
    if(remaining<=0) clearInterval(window._expiryInterval)
  }
  tick()
  window._expiryInterval = setInterval(tick,1000)
}
