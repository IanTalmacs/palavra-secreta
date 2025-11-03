const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
app.use(express.static(path.join(__dirname, 'public')))
const WORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'words.json')))
const players = {}
let adminId = null
let gameStarted = false
let usedWords = new Set()
let scores = { team1: 0, team2: 0 }
let currentRound = null

function pickWord(category) {
  if (!category || !WORDS[category]) return null
  const pool = WORDS[category].filter(w => !usedWords.has(w))
  if (pool.length === 0) return null
  const w = pool[Math.floor(Math.random() * pool.length)]
  usedWords.add(w)
  return w
}

function broadcastPlayers() {
  const list = Object.keys(players).map(id => {
    const p = players[id]
    return { id, name: p.name, team: p.team }
  })
  io.emit('players', list)
}

io.on('connection', socket => {
  socket.on('confirm-name', name => {
    players[socket.id] = { name: name || 'Anon', team: 'lobby', isAdmin: false }
    broadcastPlayers()
    socket.emit('name-confirmed', { id: socket.id })
  })

  socket.on('choose-role', data => {
    const { role, password } = data
    if (!players[socket.id]) return
    if (role === 'admin' && password === '12345678') {
      players[socket.id].isAdmin = true
      adminId = socket.id
      socket.emit('role-accepted', { admin: true })
    } else {
      socket.emit('role-accepted', { admin: false })
    }
    broadcastPlayers()
    socket.emit('game-state', { gameStarted, scores })
  })

  socket.on('move-player', ({ playerId, team }) => {
    if (socket.id !== adminId) return
    if (players[playerId]) {
      players[playerId].team = team
      broadcastPlayers()
    }
  })

  socket.on('start-game', () => {
    if (socket.id !== adminId) return
    gameStarted = true
    usedWords = new Set()
    scores = { team1: 0, team2: 0 }
    currentRound = null
    io.emit('game-started', { scores })
    broadcastPlayers()
  })

  socket.on('select-category', cat => {
    if (socket.id !== adminId) return
    if (!currentRound) currentRound = {}
    currentRound.category = cat
    io.emit('category-selected', cat)
  })

  socket.on('select-player', playerId => {
    if (socket.id !== adminId) return
    if (!currentRound) currentRound = {}
    currentRound.selectedPlayer = playerId
    io.emit('player-selected', playerId)
  })

  socket.on('begin-round', () => {
    if (socket.id !== adminId) return
    if (!currentRound || !currentRound.selectedPlayer || !currentRound.category) return
    const target = currentRound.selectedPlayer
    const firstWord = pickWord(currentRound.category)
    currentRound.roundActive = true
    currentRound.startTime = Date.now()
    currentRound.remaining = 75
    currentRound.roundWords = []
    currentRound.roundTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - currentRound.startTime) / 1000)
      const rem = 75 - elapsed
      currentRound.remaining = rem
      io.emit('round-tick', rem)
      if (rem <= 0) {
        clearInterval(currentRound.roundTimer)
        currentRound.roundActive = false
        io.emit('round-ended', {
          words: currentRound.roundWords || [],
          scores
        })
        currentRound = Object.assign({}, currentRound, { awaitingAdvance: true })
      }
    }, 1000)
    io.to(target).emit('round-start', { you: true, word: firstWord, remaining: 75 })
    socket.broadcast.emit('round-start', { you: false, remaining: 75 })
    if (firstWord) currentRound.roundWords.push({ word: firstWord, status: 'current' })
  })

  socket.on('acertou', () => {
    if (!currentRound || !currentRound.roundActive) return
    if (socket.id !== currentRound.selectedPlayer) return
    const team = players[socket.id].team
    if (team === 'team1') scores.team1 += 1
    if (team === 'team2') scores.team2 += 1
    const next = pickWord(currentRound.category)
    if (currentRound.roundWords.length) {
      const last = currentRound.roundWords[currentRound.roundWords.length - 1]
      if (last.status === 'current') last.status = 'acertou'
    }
    if (next) currentRound.roundWords.push({ word: next, status: 'current' })
    io.emit('score-update', scores)
    io.to(socket.id).emit('new-word', next)
    io.emit('words-update', currentRound.roundWords)
  })

  socket.on('pular', () => {
    if (!currentRound || !currentRound.roundActive) return
    if (socket.id !== currentRound.selectedPlayer) return
    if (currentRound.roundWords.length) {
      const last = currentRound.roundWords[currentRound.roundWords.length - 1]
      if (last.status === 'current') last.status = 'pulou'
    }
    io.emit('words-update', currentRound.roundWords)
    const playerSocket = socket.id
    io.to(playerSocket).emit('puling')
    setTimeout(() => {
      const next = pickWord(currentRound.category)
      if (next) currentRound.roundWords.push({ word: next, status: 'current' })
      io.to(playerSocket).emit('new-word', next)
      io.emit('words-update', currentRound.roundWords)
    }, 3000)
  })

  socket.on('advance', () => {
    if (socket.id !== adminId) return
    if (!currentRound) return
    if (currentRound.roundTimer) {
      try { clearInterval(currentRound.roundTimer) } catch (e) {}
    }
    currentRound = null
    io.emit('back-to-lobby-screen', { scores })
  })

  socket.on('force-end-round', () => {
    if (socket.id !== adminId) return
    if (currentRound && currentRound.roundTimer) {
      clearInterval(currentRound.roundTimer)
      currentRound.roundActive = false
      io.emit('round-ended', {
        words: currentRound.roundWords || [],
        scores
      })
      currentRound = Object.assign({}, currentRound, { awaitingAdvance: true })
    }
  })

  socket.on('disconnect', () => {
    const wasAdmin = players[socket.id] && players[socket.id].isAdmin
    delete players[socket.id]
    if (wasAdmin) {
      adminId = null
    }
    broadcastPlayers()
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT)
