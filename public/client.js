const socket = io()
let myId = null
let amAdmin = false
const namePopup = document.getElementById('namePopup')
const nameInput = document.getElementById('nameInput')
const confirmNameBtn = document.getElementById('confirmNameBtn')
const renameBtn = document.getElementById('renameBtn')
const resetBtn = document.getElementById('resetBtn')
const renamePopup = document.getElementById('renamePopup')
const renameA = document.getElementById('renameA')
const renameB = document.getElementById('renameB')
const applyRename = document.getElementById('applyRename')
const cancelRename = document.getElementById('cancelRename')
const teamAName = document.getElementById('teamAName')
const teamBName = document.getElementById('teamBName')
const teamAScore = document.getElementById('teamAScore')
const teamBScore = document.getElementById('teamBScore')
const categorySelect = document.getElementById('categorySelect')
const playerSelect = document.getElementById('playerSelect')
const teamSelect = document.getElementById('teamSelect')
const startRoundBtn = document.getElementById('startRoundBtn')
const drawnList = document.getElementById('drawnList')
const roundPopup = document.getElementById('roundPopup')
const roundWordEl = document.getElementById('roundWord')
const roundTimerEl = document.getElementById('roundTimer')
const correctBtn = document.getElementById('correctBtn')
const skipBtn = document.getElementById('skipBtn')
const skipStatus = document.getElementById('skipStatus')
let roundTimerInterval = null
confirmNameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Jogador'
  socket.emit('setName', name)
  namePopup.classList.add('hidden')
})
renameBtn.addEventListener('click', () => {
  if (!amAdmin) return
  renamePopup.classList.remove('hidden')
})
cancelRename.addEventListener('click', () => {
  renamePopup.classList.add('hidden')
})
applyRename.addEventListener('click', () => {
  const a = renameA.value.trim()
  const b = renameB.value.trim()
  socket.emit('renameTeams', { a, b })
  renamePopup.classList.add('hidden')
})
resetBtn.addEventListener('click', () => {
  if (!amAdmin) return
  if (!confirm) { socket.emit('resetGame') } else { socket.emit('resetGame') }
})
startRoundBtn.addEventListener('click', () => {
  if (!amAdmin) return
  const playerId = playerSelect.value
  const category = categorySelect.value
  const team = teamSelect.value
  if (!playerId || !category || !team) return
  socket.emit('startRound', { playerId, category, teamKey: team })
})
correctBtn.addEventListener('click', () => {
  socket.emit('correct')
})
skipBtn.addEventListener('click', () => {
  socket.emit('skip')
})
socket.on('init', data => {
  myId = data.id
})
socket.on('you', data => {
  if (data.id === myId) amAdmin = !!data.isAdmin
  updateAdminUI()
})
socket.on('state', state => {
  teamAName.textContent = state.teams.a.name
  teamBName.textContent = state.teams.b.name
  teamAScore.textContent = state.teams.a.score
  teamBScore.textContent = state.teams.b.score
  while (categorySelect.firstChild) categorySelect.removeChild(categorySelect.firstChild)
  state.categories.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.name
    opt.textContent = `${c.name} (${c.remaining})`
    categorySelect.appendChild(opt)
  })
  const prev = playerSelect.value
  while (playerSelect.firstChild) playerSelect.removeChild(playerSelect.firstChild)
  state.players.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.name
    playerSelect.appendChild(opt)
  })
  if (Array.from(playerSelect.options).some(o=>o.value===prev)) playerSelect.value = prev
  drawnList.innerHTML = ''
  state.drawnWordsLastRound.forEach(w => {
    const li = document.createElement('li'); li.textContent = w; drawnList.appendChild(li)
  })
  updateAdminUI()
})
socket.on('drawnWordsUpdate', list => {
  drawnList.innerHTML = ''
  list.forEach(w => {
    const li = document.createElement('li'); li.textContent = w; drawnList.appendChild(li)
  })
})
socket.on('clearDrawnWords', () => {
  drawnList.innerHTML = ''
})
socket.on('showRoundPopup', ({ word, timeLeft }) => {
  roundPopup.classList.remove('hidden')
  roundWordEl.textContent = word
  startRoundTimer(timeLeft)
  skipStatus.textContent = ''
})
socket.on('roundWord', ({ word }) => {
  roundWordEl.textContent = word
  skipStatus.textContent = ''
})
socket.on('skipping', () => {
  skipStatus.textContent = 'pulando...'
})
socket.on('roundEnd', ({ reason }) => {
  roundPopup.classList.add('hidden')
  roundWordEl.textContent = ''
  stopRoundTimer()
  skipStatus.textContent = ''
})
socket.on('roundEnd', () => {
  roundPopup.classList.add('hidden')
  stopRoundTimer()
})
socket.on('drawnWordsUpdate', list => {
  drawnList.innerHTML = ''
  list.forEach(w => {
    const li = document.createElement('li'); li.textContent = w; drawnList.appendChild(li)
  })
})
function updateAdminUI() {
  renameBtn.disabled = !amAdmin
  resetBtn.disabled = !amAdmin
  startRoundBtn.disabled = !amAdmin
}
function startRoundTimer(seconds) {
  stopRoundTimer()
  let remaining = seconds
  roundTimerEl.textContent = `${remaining}s`
  roundTimerInterval = setInterval(() => {
    remaining -= 1
    roundTimerEl.textContent = `${remaining}s`
    if (remaining <= 0) stopRoundTimer()
  }, 1000)
}
function stopRoundTimer() {
  if (roundTimerInterval) clearInterval(roundTimerInterval)
  roundTimerInterval = null
  roundTimerEl.textContent = ''
}
