const socket = io()
let me = {}, screen = 1, roundWords = [], skippedWords = [], countdown
window.onbeforeunload = () => 'Tem certeza que quer sair?'

const app = document.getElementById('app')

function render() {
  if (screen === 1) {
    app.innerHTML = `
      <h2>Escolha seu nome e equipe</h2>
      <input id="name" placeholder="Nome" style="font-size:1.2rem;padding:10px">
      <div>
        <button onclick="join(1)">Equipe 1</button>
        <button onclick="join(2)">Equipe 2</button>
      </div>
    `
  }
  if (screen === 2) {
    app.innerHTML = `<div id="score">Equipe 1: ${me.scores?.team1 || 0} | Equipe 2: ${me.scores?.team2 || 0}</div><div id="cats"></div>`
    if (me.isAdmin) {
      socket.emit('getCategories')
    }
  }
  if (screen === 3 && me.isAdmin) {
    app.innerHTML = `<h2>Jogadores</h2><div id="players"></div>`
    renderPlayers()
  }
}

function join(team) {
  const name = document.getElementById('name').value
  if (!name) return
  socket.emit('join', { name, team })
  me.team = 'team' + team
  screen = 2
  render()
}

socket.on('players', players => {
  me.players = players
  renderPlayers()
})

function renderPlayers() {
  if (!me.isAdmin) return
  const div = document.getElementById('players')
  if (!div) return
  div.innerHTML = ''
  Object.entries(me.players).forEach(([id, p]) => {
    div.innerHTML += `<button class="player-btn" onclick="choosePlayer('${id}')">${p.name}</button>`
  })
}

function choosePlayer(id) {
  socket.emit('choosePlayer', id)
}

socket.on('categories', cats => {
  const div = document.getElementById('cats')
  cats.forEach(c => {
    div.innerHTML += `<button class="category" onclick="chooseCategory('${c}')">${c}</button>`
  })
})

function chooseCategory(cat) {
  socket.emit('chooseCategory', cat)
  screen = 3
  render()
}

socket.on('categoryChosen', cat => {
  if (!me.isAdmin) screen = 3
  render()
})

socket.on('playerChosen', id => {
  if (id === socket.id) {
    app.innerHTML = `<button onclick="startRound()">Iniciar</button>`
  }
})

function startRound() {
  socket.emit('startRound')
}

socket.on('roundStarted', id => {
  if (id === socket.id) startPlayerRound()
  else startSpectatorRound()
})

function startPlayerRound() {
  screen = 4
  roundWords = []
  skippedWords = []
  let time = 75
  app.innerHTML = `<div id="timer">${time}</div><div id="word" class="word"></div><button class="green" id="correct">Acertou</button><button class="red" id="skip">Pular</button>`
  socket.emit('getWord')
  countdown = setInterval(() => {
    time--
    document.getElementById('timer').innerText = time
    if (time <= 0) {
      clearInterval(countdown)
      socket.emit('endRound')
    }
  }, 1000)
  document.getElementById('correct').onclick = () => {
    roundWords.push(document.getElementById('word').innerText)
    socket.emit('correct', me.team)
    socket.emit('getWord')
  }
  document.getElementById('skip').onclick = () => {
    const w = document.getElementById('word').innerText
    skippedWords.push(w)
    document.getElementById('word').innerText = 'Pulando...'
    setTimeout(() => socket.emit('getWord'), 3000)
  }
}

socket.on('newWord', word => {
  const w = document.getElementById('word')
  if (w) w.innerText = word
})

function startSpectatorRound() {
  screen = 4
  let time = 75
  app.innerHTML = `<div id="timer">${time}</div>`
  countdown = setInterval(() => {
    time--
    document.getElementById('timer').innerText = time
    if (time <= 0) clearInterval(countdown)
  }, 1000)
}

socket.on('updateScore', s => {
  me.scores = s
})

socket.on('roundEnded', () => {
  clearInterval(countdown)
  screen = 5
  app.innerHTML = `<h2>Resultados</h2>`
  roundWords.forEach(w => app.innerHTML += `<div class="green">${w}</div>`)
  skippedWords.forEach(w => app.innerHTML += `<div class="red">${w}</div>`)
  if (me.isAdmin) app.innerHTML += `<button onclick="goCategories()">Categorias</button>`
})

function goCategories() {
  screen = 2
  render()
}

socket.on('resetAll', () => {
  screen = 1
  me = {}
  render()
})

render()
