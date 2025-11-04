const socket = io()
let myId = null
let amAdmin = false
let state = {}
const el = id => document.getElementById(id)
el('joinBtn').addEventListener('click', () => {
  const name = el('nameInput').value.trim() || 'Jogador'
  socket.emit('join', name)
})
el('startBtn').addEventListener('click', () => {
  const t1 = el('team1Input').value.trim() || 'Equipe 1'
  const t2 = el('team2Input').value.trim() || 'Equipe 2'
  socket.emit('admin_set_teams', { team1: t1, team2: t2 })
  socket.emit('admin_start_game')
})
el('adminTeams').addEventListener('keydown', e => { if (e.key === 'Enter') el('startBtn').click() })
el('startRoundBtn').addEventListener('click', () => socket.emit('admin_start_round'))
el('correctBtn').addEventListener('click', () => socket.emit('hit'))
el('skipBtn').addEventListener('click', () => socket.emit('skip'))
el('continueBtn').addEventListener('click', () => socket.emit('admin_continue'))
window.addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = '' })
socket.on('connected', d => { myId = d.id })
socket.on('you_are_admin', () => {
  amAdmin = true
  el('adminTeams').classList.remove('hidden')
  el('startBtn').classList.remove('hidden')
})
socket.on('state', s => {
  state = s
  renderState()
})
socket.on('reset', () => {
  amAdmin = false
  myId = null
  state = {}
  el('naming').classList.remove('hidden')
  el('categorias').classList.add('hidden')
  el('round').classList.add('hidden')
  el('verification').classList.add('hidden')
})
socket.on('selections', sel => {
  state.selections = sel
  renderSelections()
})
socket.on('round_started', data => {
  const isPlayer = data.playerId === myId
  el('categorias').classList.add('hidden')
  if (isPlayer) {
    el('round').classList.remove('hidden')
  } else {
    el('round').classList.add('hidden')
  }
  startCountdown(data.endTime)
})
socket.on('round_word', data => {
  el('skipText').classList.add('hidden')
  el('wordDisplay').textContent = data.word || '[SEM PALAVRAS]'
  renderTeams(data.scores)
})
socket.on('skipping', () => {
  el('skipText').classList.remove('hidden')
})
socket.on('round_ended', data => {
  el('round').classList.add('hidden')
  el('verification').classList.remove('hidden')
  renderVerification(data.words, data.scores)
})
socket.on('hide_verification', () => {
  el('verification').classList.add('hidden')
})
function renderState() {
  renderTeamsUI(state.teams || [])
  renderPlayerButtons(state.players || [])
  renderCategoryButtons(state.categories || [])
  if (state.phase) {
    if (state.phase.namingVisible) {
      el('naming').classList.remove('hidden')
    } else {
      el('naming').classList.add('hidden')
    }
    if (state.phase.categoriasVisible) {
      el('categorias').classList.remove('hidden')
    } else {
      el('categorias').classList.add('hidden')
    }
    if (state.phase.superiorVisible) {
      // nothing extra
    }
  }
  renderSelections()
}
function renderTeamsUI(teams) {
  const container = el('teams')
  container.innerHTML = ''
  teams.forEach(t => {
    const d = document.createElement('div')
    d.className = 'teamCard'
    d.innerHTML = `<div style="font-size:12px;color:var(--muted)">${t.name}</div><div style="font-size:18px;font-weight:800">${t.score}</div>`
    container.appendChild(d)
  })
  const ctrl = el('controls')
  ctrl.innerHTML = ''
  if (amAdmin) {
    const resetBtn = document.createElement('button')
    resetBtn.textContent = 'Reset'
    resetBtn.addEventListener('click', () => socket.emit('admin_reset'))
    ctrl.appendChild(resetBtn)
  }
}
function renderPlayerButtons(players) {
  const pcont = el('playerButtons')
  pcont.innerHTML = ''
  players.forEach(p => {
    const b = document.createElement('button')
    b.textContent = p.name
    b.dataset.id = p.id
    b.addEventListener('click', () => {
      if (!amAdmin) return
      socket.emit('select', { type: 'player', id: p.id })
    })
    pcont.appendChild(b)
  })
}
function renderCategoryButtons(categories) {
  const ccont = el('categoryButtons')
  ccont.innerHTML = ''
  categories.forEach(c => {
    const b = document.createElement('button')
    b.textContent = c
    b.dataset.id = c
    b.addEventListener('click', () => {
      if (!amAdmin) return
      socket.emit('select', { type: 'category', id: c })
    })
    ccont.appendChild(b)
  })
}
function renderTeamButtons(teams) {
  const tcont = el('teamButtons')
  tcont.innerHTML = ''
  (teams||[]).forEach(t => {
    const b = document.createElement('button')
    b.textContent = t.name
    b.dataset.id = t.id
    b.addEventListener('click', () => {
      if (amAdmin) {
        socket.emit('select', { type: 'team', id: t.id })
      } else {
        socket.emit('choose_team', t.id)
      }
    })
    tcont.appendChild(b)
  })
}
function renderSelections() {
  const sel = state.selections || {}
  Array.from(document.querySelectorAll('#categoryButtons button')).forEach(b => b.classList.toggle('selected', b.dataset.id === sel.category))
  Array.from(document.querySelectorAll('#playerButtons button')).forEach(b => b.classList.toggle('selected', b.dataset.id === sel.playerId))
  Array.from(document.querySelectorAll('#teamButtons button')).forEach(b => b.classList.toggle('selected', b.dataset.id === sel.teamId))
  const startBtn = el('startRoundBtn')
  if (amAdmin && sel.category && sel.playerId && sel.teamId) startBtn.classList.remove('hidden') else startBtn.classList.add('hidden')
}
function startCountdown(endTime) {
  clearInterval(window._countdownInterval)
  function tick() {
    const now = Date.now()
    const rem = Math.max(0, Math.ceil((endTime - now)/1000))
    el('countdown').textContent = rem
    if (rem <= 0) clearInterval(window._countdownInterval)
  }
  tick()
  window._countdownInterval = setInterval(tick, 250)
}
function renderVerification(words, scores) {
  const correct = words.filter(w => w.status === 'acertou')
  const skipped = words.filter(w => w.status === 'pulou')
  const cl = el('correctList'); cl.innerHTML = '<h4>Acertadas</h4>'
  correct.forEach(w => { const d = document.createElement('div'); d.className='correctItem'; d.textContent = w.word; cl.appendChild(d) })
  const sl = el('skipList'); sl.innerHTML = '<h4>Puladas</h4>'
  skipped.forEach(w => { const d = document.createElement('div'); d.className='skipItem'; d.textContent = w.word; sl.appendChild(d) })
  renderTeams(scores)
  if (amAdmin) el('continueBtn').classList.remove('hidden') else el('continueBtn').classList.add('hidden')
}
function renderTeams(scores) {
  if (!scores) return
  const tdiv = el('teams')
  const names = Array.from(tdiv.querySelectorAll('.teamCard'))
  scores.forEach((s,i) => {
    if (names[i]) names[i].querySelector('div:last-child').textContent = s.score
  })
}
socket.on('state', s => {
  renderTeamButtons(s.teams)
})
