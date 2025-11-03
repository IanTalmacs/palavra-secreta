const socket = io()
let myId = null
let myRole = 'visitor'
let selectedCategory = null
let selectedPlayer = null
let currentScreen = '1'
const categoriesList = ["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissoes","alimentos","personagens","biblico"]
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('nameInput')
  const confirmName = document.getElementById('confirmName')
  const roleButtons = document.getElementById('roleButtons')
  const visitorBtn = document.getElementById('visitorBtn')
  const adminBtn = document.getElementById('adminBtn')
  const screen1 = document.getElementById('screen1')
  const screen2a = document.getElementById('screen2a')
  const screen2b = document.getElementById('screen2b')
  const screen3 = document.getElementById('screen3')
  const screen4a = document.getElementById('screen4a')
  const screen4b = document.getElementById('screen4b')
  const screen5 = document.getElementById('screen5')
  const lobbyList = document.getElementById('lobbyList')
  const team1List = document.getElementById('team1List')
  const team2List = document.getElementById('team2List')
  const startGameBtn = document.getElementById('startGameBtn')
  const categoriesEl = document.getElementById('categories')
  const playersBtns = document.getElementById('playersBtns')
  const startRoundWrapper = document.getElementById('startRoundWrapper')
  const timerA = document.getElementById('timerA')
  const timerB = document.getElementById('timerB')
  const currentWordEl = document.getElementById('currentWord')
  const correctBtn = document.getElementById('correctBtn')
  const skipBtn = document.getElementById('skipBtn')
  const wordsList = document.getElementById('wordsList')
  const advanceBtn = document.getElementById('advanceBtn')
  const resetBtn = document.getElementById('resetBtn')
  const menuBtns = document.querySelectorAll('.menu-btn')
  confirmName.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Jogador'
    socket.emit('join', { name })
    roleButtons.classList.remove('hidden')
    showScreen('1-post')
  })
  visitorBtn.addEventListener('click', () => {
    socket.emit('become_visitor')
    myRole = 'visitor'
    showScreen('2a')
  })
  adminBtn.addEventListener('click', async () => {
    const pass = prompt('Senha de admin')
    socket.emit('become_admin', pass)
  })
  socket.on('joined', data => {
    myId = data.id
  })
  socket.on('became_admin', () => {
    myRole = 'admin'
    showScreen('2b')
  })
  socket.on('bad_admin', () => {
    alert('Senha incorreta')
  })
  socket.on('lobby_update', data => {
    renderLobby(data.players)
    document.getElementById('score1').innerText = data.points.team1
    document.getElementById('score2').innerText = data.points.team2
  })
  function renderLobby(players) {
    lobbyList.innerHTML = ''
    team1List.innerHTML = ''
    team2List.innerHTML = ''
    players.forEach(p => {
      const li = document.createElement('li')
      li.innerText = p.name
      li.draggable = myRole === 'admin'
      li.dataset.id = p.id
      li.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', p.id)
      })
      if (p.team === 'lobby') lobbyList.appendChild(li)
      if (p.team === 'team1') team1List.appendChild(li)
      if (p.team === 'team2') team2List.appendChild(li)
    })
  }
  document.querySelectorAll('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => e.preventDefault())
    zone.addEventListener('drop', e => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      const team = zone.dataset.team
      socket.emit('move_player', { playerId: id, team })
    })
  })
  startGameBtn.addEventListener('click', () => {
    socket.emit('start_game')
  })
  function renderCategories() {
    categoriesEl.innerHTML = ''
    categoriesList.forEach(cat => {
      const b = document.createElement('button')
      b.className = 'category-btn'
      b.innerText = cat
      b.addEventListener('click', () => {
        if (myRole !== 'admin') return
        if (selectedCategory === cat) {
          selectedCategory = null
          b.classList.remove('selected')
        } else {
          selectedCategory = cat
          document.querySelectorAll('.category-btn').forEach(x => x.classList.remove('selected'))
          b.classList.add('selected')
        }
        renderStartRound()
      })
      categoriesEl.appendChild(b)
    })
  }
  function renderPlayersButtons(lobbyData) {
    playersBtns.innerHTML = ''
    const players = lobbyData || []
    players.forEach(p => {
      const b = document.createElement('button')
      b.className = 'player-btn'
      b.innerText = p.name
      b.dataset.id = p.id
      b.addEventListener('click', () => {
        if (myRole !== 'admin') return
        if (selectedPlayer === p.id) {
          selectedPlayer = null
          b.classList.remove('selected')
        } else {
          selectedPlayer = p.id
          document.querySelectorAll('.player-btn').forEach(x => x.classList.remove('selected'))
          b.classList.add('selected')
        }
        renderStartRound()
      })
      playersBtns.appendChild(b)
    })
  }
  socket.on('game_started', () => {
    showScreen('3')
  })
  socket.on('show_screen', ({ screen, points }) => {
    if (screen === '1') {
      showScreen('1')
    } else if (screen === '2') {
      if (myRole === 'admin') showScreen('2b')
      else showScreen('2a')
    } else if (screen === '3') {
      showScreen('3')
    } else if (screen === '5') {
      showScreen('5')
    }
    if (points) {
      document.getElementById('score1').innerText = points.team1
      document.getElementById('score2').innerText = points.team2
    }
  })
  socket.on('show_round_other', ({ endTime }) => {
    showScreen('4b')
  })
  socket.on('new_word', ({ word, endTime }) => {
    showScreen('4a')
    currentWordEl.innerText = word
    startLocalTimer(endTime)
  })
  socket.on('skipping', () => {
    currentWordEl.innerText = 'pulando...'
  })
  socket.on('round_timer', ({ remaining }) => {
    timerA.innerText = remaining
    timerB.innerText = remaining
  })
  socket.on('round_end', ({ solved, skipped, points }) => {
    wordsList.innerHTML = ''
    solved.forEach(w => {
      const li = document.createElement('li')
      li.className = 'green'
      li.innerText = w
      wordsList.appendChild(li)
    })
    skipped.forEach(w => {
      const li = document.createElement('li')
      li.className = 'red'
      li.innerText = w
      wordsList.appendChild(li)
    })
    document.getElementById('score1').innerText = points.team1
    document.getElementById('score2').innerText = points.team2
    showScreen('5')
  })
  socket.on('no_words_left', ({ category }) => {
    alert('Sem palavras restantes na categoria: ' + category)
  })
  socket.on('reset', () => {
    myRole = 'visitor'
    myId = null
    selectedCategory = null
    selectedPlayer = null
    showScreen('1')
    location.reload()
  })
  socket.on('lobby_update', data => {
    renderPlayersButtons(data.players)
  })
  correctBtn.addEventListener('click', () => {
    socket.emit('correct')
  })
  skipBtn.addEventListener('click', () => {
    socket.emit('skip')
  })
  advanceBtn.addEventListener('click', () => {
    socket.emit('advance')
  })
  resetBtn.addEventListener('click', () => {
    if (myRole !== 'admin') return
    socket.emit('reset_all')
  })
  menuBtns.forEach(b => {
    b.addEventListener('click', () => {
      if (myRole !== 'admin') return
      const screen = b.dataset.screen
      socket.emit('admin_nav', { screen })
      if (screen === '2') showScreen('2b')
      if (screen === '3') showScreen('3')
      if (screen === '5') showScreen('5')
    })
  })
  function renderStartRound() {
    startRoundWrapper.innerHTML = ''
    if (selectedCategory && selectedPlayer) {
      const btn = document.createElement('button')
      btn.className = 'btn large'
      btn.innerText = 'Começar round'
      btn.addEventListener('click', () => {
        socket.emit('begin_round', { category: selectedCategory, playerId: selectedPlayer })
      })
      startRoundWrapper.appendChild(btn)
    }
  }
  function showScreen(s) {
    document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'))
    if (s === '1') {
      document.getElementById('screen1').classList.add('active')
    } else if (s === '1-post') {
      document.getElementById('screen1').classList.add('active')
    } else if (s === '2a') {
      document.getElementById('screen2a').classList.add('active')
    } else if (s === '2b') {
      document.getElementById('screen2b').classList.add('active')
    } else if (s === '3') {
      document.getElementById('screen3').classList.add('active')
    } else if (s === '4a') {
      document.getElementById('screen4a').classList.add('active')
    } else if (s === '4b') {
      document.getElementById('screen4b').classList.add('active')
    } else if (s === '5') {
      document.getElementById('screen5').classList.add('active')
    }
    currentScreen = s
  }
  function startLocalTimer(endTime) {
    updateTimer()
    function updateTimer() {
      const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      timerA.innerText = rem
      timerB.innerText = rem
      if (rem > 0) requestAnimationFrame(updateTimer)
    }
  }
  renderCategories()
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault()
    e.returnValue = ''
  })
})
