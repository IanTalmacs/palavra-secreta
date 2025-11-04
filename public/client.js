/* public/client.js */
const socket = io()
let clientId = null
let isAdmin = false
let teams = ['', '']
const initial = document.getElementById('initial')
const game = document.getElementById('game')
const nameInput = document.getElementById('name')
const enterBtn = document.getElementById('enter')
const adminTeams = document.getElementById('adminTeams')
const team1Input = document.getElementById('team1')
const team2Input = document.getElementById('team2')
const resetBtn = document.getElementById('resetBtn')
const categoryButtons = document.getElementById('categoryButtons')
const playerButtons = document.getElementById('playerButtons')
const teamButtons = document.getElementById('teamButtons')
const startRoundWrapper = document.getElementById('startRoundWrapper')
const startRoundBtn = document.getElementById('startRound')
const categoriasSection = document.getElementById('categorias')
const roundSection = document.getElementById('round')
const verificationSection = document.getElementById('verificacao')
const timerEl = document.getElementById('timer')
const wordEl = document.getElementById('word')
const correctBtn = document.getElementById('correct')
const skipBtn = document.getElementById('skip')
const resultsEl = document.getElementById('results')
const continueWrapper = document.getElementById('continueWrapper')
const continueBtn = document.getElementById('continueBtn')
const teamAEl = document.querySelector('#teamA .teamname')
const teamBEl = document.querySelector('#teamB .teamname')
const teamAScoreEl = document.querySelector('#teamA .score')
const teamBScoreEl = document.querySelector('#teamB .score')
let currentRoundPlayer = null
let currentRemaining = 75
let localSelection = { category: null, playerId: null, teamIndex: null }
function showInitial(){ initial.classList.remove('hidden'); game.classList.add('hidden') }
function showGame(){ initial.classList.add('hidden'); game.classList.remove('hidden') }
nameInput.addEventListener('input', ()=> {
  const v = nameInput.value.toLowerCase()
  if (v.includes('admin')) adminTeams.classList.remove('hidden') 
  else adminTeams.classList.add('hidden')
})
enterBtn.addEventListener('click', ()=> {
  const name = nameInput.value.trim()
  if (!name) return
  if (name.toLowerCase().includes('admin')) {
    const t1 = team1Input.value.trim() || 'Time A'
    const t2 = team2Input.value.trim() || 'Time B'
    socket.emit('join', { name, teams: [t1, t2] })
  } else {
    socket.emit('join', { name })
  }
  showGame()
})
resetBtn.addEventListener('click', ()=> socket.emit('reset'))
startRoundBtn.addEventListener('click', ()=> socket.emit('startRound'))
correctBtn.addEventListener('click', ()=> socket.emit('correct'))
skipBtn.addEventListener('click', ()=> socket.emit('skip'))
continueBtn.addEventListener('click', ()=> socket.emit('continue'))
socket.on('joined', data => {
  clientId = data.id
  isAdmin = data.isAdmin
  teams = data.teams || teams
  if (isAdmin) resetBtn.classList.remove('hidden')
  else resetBtn.classList.add('hidden')
  renderTeams()
})
socket.on('state', s => {
  renderPlayers(s.players || [])
  teams = s.teams || teams
  renderTeams()
  updateScores(s.scores || { '0':0,'1':0 })
  if (s.phase === 'init') {
    categoriasSection.classList.add('hidden')
    roundSection.classList.add('hidden')
    verificationSection.classList.add('hidden')
  } else if (s.phase === 'categories') {
    categoriasSection.classList.remove('hidden')
    roundSection.classList.add('hidden')
    verificationSection.classList.add('hidden')
  }
})
socket.on('selectionUpdate', sel => {
  localSelection = { category: sel.category, playerId: sel.playerId, teamIndex: sel.teamIndex }
  updateSelections()
  if (localSelection.category && localSelection.playerId && typeof localSelection.teamIndex === 'number') {
    startRoundWrapper.classList.remove('hidden')
  } else startRoundWrapper.classList.add('hidden')
})
socket.on('hideCategorias', ()=> {
  categoriasSection.classList.add('hidden')
})
socket.on('showCategorias', ()=> {
  categoriasSection.classList.remove('hidden')
})
socket.on('startRound', data => {
  currentRoundPlayer = clientId
  roundSection.classList.remove('hidden')
  categoriasSection.classList.add('hidden')
  verificationSection.classList.add('hidden')
  wordEl.textContent = data.word || ''
  timerEl.textContent = data.remaining || '75'
  currentRemaining = data.remaining || 75
})
socket.on('tick', d => {
  timerEl.textContent = d.remaining
})
socket.on('newWord', d => {
  wordEl.textContent = d.word
})
socket.on('skipping', ()=> {
  wordEl.textContent = 'pulando...'
})
socket.on('roundEnd', d => {
  roundSection.classList.add('hidden')
  verificationSection.classList.remove('hidden')
  resultsEl.innerHTML = ''
  d.results.forEach(r => {
    const div = document.createElement('div')
    div.className = 'result ' + (r.status === 'skipped' ? 'skipped' : 'correct')
    div.textContent = r.word + ' — ' + (r.status === 'skipped' ? 'Pulada' : 'Acertada')
    resultsEl.appendChild(div)
  })
  updateScores(d.points || { '0':0,'1':0 })
  if (isAdmin) continueWrapper.classList.remove('hidden')
  else continueWrapper.classList.add('hidden')
})
socket.on('scoreUpdate', d => updateScores(d.scores || { '0':0,'1':0 }))
socket.on('resetAll', ()=> {
  location.reload()
})
socket.on('noWords', d => {
  alert('Sem palavras restantes na categoria: ' + d.category)
})
function updateScores(s){ teamAScoreEl.textContent = s['0'] || 0; teamBScoreEl.textContent = s['1'] || 0 }
function renderTeams(){
  teamAEl.textContent = teams[0] || 'Time A'
  teamBEl.textContent = teams[1] || 'Time B'
  teamButtons.innerHTML = ''
  const b1 = document.createElement('button')
  b1.className = 'team-btn'
  b1.textContent = teams[0] || 'Time A'
  b1.addEventListener('click', ()=> {
    if (!isAdmin) return
    socket.emit('select', { type: 'team', value: 0 })
  })
  const b2 = document.createElement('button')
  b2.className = 'team-btn'
  b2.textContent = teams[1] || 'Time B'
  b2.addEventListener('click', ()=> {
    if (!isAdmin) return
    socket.emit('select', { type: 'team', value: 1 })
  })
  teamButtons.appendChild(b1); teamButtons.appendChild(b2)
}
function renderPlayers(players){
  playerButtons.innerHTML = ''
  players.forEach(p => {
    const btn = document.createElement('button')
    btn.className = 'player-btn'
    btn.textContent = p.name
    btn.addEventListener('click', ()=> {
      if (!isAdmin) return
      socket.emit('select', { type: 'player', value: p.id })
    })
    playerButtons.appendChild(btn)
  })
}
const categories = ['animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissoes','alimentos','personagens','biblico']
function initCategories(){
  categoryButtons.innerHTML = ''
  categories.forEach(c => {
    const b = document.createElement('button')
    b.className = 'cat-btn'
    b.textContent = c
    b.addEventListener('click', ()=> {
      if (!isAdmin) return
      socket.emit('select', { type: 'category', value: c })
    })
    categoryButtons.appendChild(b)
  })
}
function updateSelections(){
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === localSelection.category)
  })
  document.querySelectorAll('.player-btn').forEach(btn => {
    btn.classList.toggle('selected', Array.from(btn.textContent).join('') && false)
  })
  document.querySelectorAll('.player-btn').forEach(btn => {
    const id = Array.from(document.querySelectorAll('.player-btn')).indexOf(btn)
  })
  document.querySelectorAll('.player-btn').forEach(btn => btn.classList.remove('selected'))
  const players = document.querySelectorAll('#playerButtons .player-btn')
  players.forEach(pbtn => {
    if (!localSelection.playerId) return
    const name = pbtn.textContent
    const matched = Array.from(Object.values(document.querySelectorAll('#playerButtons .player-btn'))).find(pb=>pb.textContent===name)
    if (!matched) return
    const idx = Array.from(document.querySelectorAll('#playerButtons .player-btn')).indexOf(matched)
  })
}
window.addEventListener('beforeunload', function (e) {
  e.preventDefault()
  e.returnValue = ''
})
initCategories()
socket.emit('requestState')
showInitial()
