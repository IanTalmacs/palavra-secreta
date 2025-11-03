const socket = io()
let myId = null
let isAdmin = false
let players = []
let selectedCategory = null
let selectedPlayer = null
let currentScreen = 'screen-1'

const qs = id => document.getElementById(id)
const show = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  const el = qs(id)
  if (el) el.classList.add('active')
  currentScreen = id
}
window.addEventListener('beforeunload', e => {
  e.preventDefault()
  e.returnValue = ''
  return ''
})

qs('confirm-name').addEventListener('click', () => {
  const name = qs('name-input').value.trim()
  socket.emit('confirm-name', name)
})

socket.on('name-confirmed', data => {
  myId = data.id
  qs('role-choice').classList.remove('hidden')
})

qs('visitor-btn').addEventListener('click', () => {
  socket.emit('choose-role', { role: 'visitor' })
  enterAsVisitor()
})

qs('admin-btn').addEventListener('click', () => {
  qs('admin-prompt').classList.remove('hidden')
})

qs('admin-submit').addEventListener('click', () => {
  const pw = qs('admin-pass').value || ''
  socket.emit('choose-role', { role: 'admin', password: pw })
})

socket.on('role-accepted', data => {
  isAdmin = !!data.admin
  if (isAdmin) {
    qs('admin-r').classList.remove('hidden')
    show('screen-2b')
  } else {
    show('screen-2a')
  }
})

function enterAsVisitor() {
  show('screen-2a')
}

socket.on('players', list => {
  players = list
  renderLists()
  renderPlayersButtons()
})

function renderLists() {
  qs('lobby-list').innerHTML = ''
  qs('team1-list').innerHTML = ''
  qs('team2-list').innerHTML = ''
  players.forEach(p => {
    const div = document.createElement('div')
    div.className = 'player'
    div.textContent = p.name
    div.dataset.id = p.id
    if (isAdmin) {
      div.draggable = true
      div.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', p.id)
      })
    }
    if (p.team === 'lobby') qs('lobby-list').appendChild(div)
    if (p.team === 'team1') qs('team1-list').appendChild(div)
    if (p.team === 'team2') qs('team2-list').appendChild(div)
  })
  if (isAdmin) {
    document.querySelectorAll('.droppable').forEach(drop => {
      drop.addEventListener('dragover', ev => { ev.preventDefault() })
      drop.addEventListener('drop', ev => {
        ev.preventDefault()
        const pid = ev.dataTransfer.getData('text/plain')
        const team = drop.dataset.team
        socket.emit('move-player', { playerId: pid, team })
      })
    })
  }
}

qs('start-game').addEventListener('click', () => {
  if (!isAdmin) return
  socket.emit('start-game')
})

socket.on('game-started', data => {
  renderScores(data.scores || { team1: 0, team2: 0 })
  const myPlayer = players.find(p => p.id === myId)
  if (myPlayer && (myPlayer.team === 'team1' || myPlayer.team === 'team2')) {
    show('screen-3')
    renderCategories()
    renderPlayersButtons()
  } else {
    show('screen-2a')
  }
})

function renderCategories() {
  const cats = ['animals','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissoes','alimentos','personagens','biblico']
  const container = qs('categories')
  container.innerHTML = ''
  cats.forEach(c => {
    const b = document.createElement('button')
    b.className = 'category'
    b.textContent = c
    b.dataset.cat = c
    b.addEventListener('click', () => {
      if (!isAdmin) return
      selectedCategory = c
      document.querySelectorAll('.category').forEach(x => x.classList.remove('selected'))
      b.classList.add('selected')
      socket.emit('select-category', c)
      tryEnableStartRound()
    })
    container.appendChild(b)
  })
}

function renderPlayersButtons() {
  const container = qs('players-buttons')
  container.innerHTML = ''
  players.forEach(p => {
    const btn = document.createElement('button')
    btn.className = 'player-btn'
    btn.textContent = p.name
    btn.dataset.id = p.id
    if (p.team === 'lobby') btn.disabled = true
    btn.addEventListener('click', () => {
      if (!isAdmin) return
      selectedPlayer = p.id
      document.querySelectorAll('.player-btn').forEach(x => x.classList.remove('selected'))
      btn.classList.add('selected')
      socket.emit('select-player', p.id)
      tryEnableStartRound()
    })
    container.appendChild(btn)
  })
}

function tryEnableStartRound() {
  if (isAdmin && selectedCategory && selectedPlayer) {
    qs('start-round').classList.remove('disabled')
  }
}

qs('start-round').addEventListener('click', () => {
  if (!isAdmin) return
  socket.emit('begin-round')
})

socket.on('round-start', data => {
  if (data.you) {
    show('screen-4a')
    qs('current-word').textContent = data.word || '---'
  } else {
    show('screen-4b')
  }
  qs('countdown').textContent = data.remaining || 75
  qs('countdown-other').textContent = data.remaining || 75
})

socket.on('round-tick', rem => {
  qs('countdown').textContent = rem
  qs('countdown-other').textContent = rem
  if (rem <= 0) {
    show('post-round')
  }
})

qs('acertou').addEventListener('click', () => {
  socket.emit('acertou')
})

qs('pular').addEventListener('click', () => {
  qs('current-word').textContent = 'Pulando...'
  socket.emit('pular')
})

socket.on('new-word', word => {
  qs('current-word').textContent = word || '---'
})

socket.on('puling', () => {
  qs('current-word').textContent = 'Pulando...'
})

socket.on('words-update', list => {
  const out = qs('round-words')
  out.innerHTML = ''
  list.forEach(it => {
    const d = document.createElement('div')
    d.className = 'word-item'
    if (it.status === 'acertou') d.classList.add('acertou')
    if (it.status === 'pulou') d.classList.add('pulou')
    d.textContent = it.word
    out.appendChild(d)
  })
  const out2 = qs('round-words-other')
  if (out2) {
    out2.innerHTML = ''
    list.forEach(it => {
      const d = document.createElement('div')
      d.className = 'word-item'
      if (it.status === 'acertou') d.classList.add('acertou')
      if (it.status === 'pulou') d.classList.add('pulou')
      d.textContent = it.word
      out2.appendChild(d)
    })
  }
})

socket.on('score-update', s => {
  renderScores(s)
})

function renderScores(s) {
  qs('score1').textContent = s.team1
  qs('score2').textContent = s.team2
}

socket.on('round-ended', data => {
  const list = data.words || []
  const out = qs('post-words')
  out.innerHTML = ''
  list.forEach(it => {
    const d = document.createElement('div')
    d.className = 'word-item'
    if (it.status === 'acertou') d.classList.add('acertou')
    if (it.status === 'pulou') d.classList.add('pulou')
    d.textContent = it.word
    out.appendChild(d)
  })
  qs('advance-btn').classList.add('disabled')
  if (isAdmin) qs('advance-btn').classList.remove('disabled')
  show('post-round')
  renderScores(data.scores || { team1: 0, team2: 0 })
})

qs('advance-btn').addEventListener('click', () => {
  if (!isAdmin) return
  socket.emit('advance')
})

socket.on('back-to-lobby-screen', data => {
  renderScores(data.scores || { team1: 0, team2: 0 })
  show('screen-3')
})

qs('admin-r').addEventListener('click', () => {
  if (!isAdmin) return
  socket.emit('force-end-round')
})

socket.on('category-selected', cat => {
  selectedCategory = cat
  document.querySelectorAll('.category').forEach(x => {
    if (x.dataset.cat === cat) x.classList.add('selected')
    else x.classList.remove('selected')
  })
})

socket.on('player-selected', pid => {
  selectedPlayer = pid
  document.querySelectorAll('.player-btn').forEach(b => {
    if (b.dataset.id === pid) b.classList.add('selected')
    else b.classList.remove('selected')
  })
})
