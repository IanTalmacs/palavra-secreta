const express = require('express')
const http = require('http')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server)
const wordsFile = path.join(__dirname, 'public', 'words.json')
let wordsData = {}
try {
  wordsData = JSON.parse(fs.readFileSync(wordsFile))
} catch (e) {
  wordsData = {}
}
app.use(express.static(path.join(__dirname, 'public')))
let players = {}
let points = { team1: 0, team2: 0 }
let usedWords = new Set()
let currentRound = null
function broadcastLobby() {
  const lobby = Object.values(players).map(p => ({ id: p.id, name: p.name, team: p.team }))
  io.emit('lobby_update', { players: lobby, points })
}
function resetAll() {
  players = {}
  points = { team1: 0, team2: 0 }
  usedWords = new Set()
  if (currentRound && currentRound.timerInterval) {
    clearInterval(currentRound.timerInterval)
  }
  currentRound = null
  io.emit('reset')
}
io.on('connection', socket => {
  socket.on('join', data => {
    const name = String(data.name || '').slice(0, 40) || 'Jogador'
    players[socket.id] = { id: socket.id, name, role: 'visitor', team: 'lobby' }
    socket.emit('joined', { id: socket.id })
    broadcastLobby()
  })
  socket.on('become_admin', pass => {
    if (pass === '12345678') {
      if (players[socket.id]) {
        players[socket.id].role = 'admin'
      } else {
        players[socket.id] = { id: socket.id, name: 'Admin', role: 'admin', team: 'lobby' }
      }
      socket.emit('became_admin')
      broadcastLobby()
    } else {
      socket.emit('bad_admin')
    }
  })
  socket.on('become_visitor', () => {
    if (players[socket.id]) {
      players[socket.id].role = 'visitor'
      players[socket.id].team = 'lobby'
    }
    broadcastLobby()
  })
  socket.on('move_player', ({ playerId, team }) => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    if (players[playerId]) {
      players[playerId].team = team
      broadcastLobby()
    }
  })
  socket.on('start_game', () => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    Object.values(players).forEach(p => {
      if (p.team === 'team1' || p.team === 'team2') {
        io.to(p.id).emit('show_screen', { screen: '3', points })
      } else {
        io.to(p.id).emit('show_screen', { screen: '2a' })
      }
    })
    io.emit('game_started')
  })
  socket.on('begin_round', ({ category, playerId }) => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    if (!players[playerId]) return
    const pool = Array.isArray(wordsData[category]) ? wordsData[category].filter(w => !usedWords.has(w)) : []
    if (pool.length === 0) {
      io.emit('no_words_left', { category })
      return
    }
    const shuffled = pool.slice().sort(() => Math.random() - 0.5)
    currentRound = {
      playerId,
      category,
      queue: shuffled,
      solved: [],
      skipped: [],
      startTime: Date.now(),
      endTime: Date.now() + 75 * 1000,
      timerInterval: null,
      pausedSkip: false
    }
    currentRound.timerInterval = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, Math.ceil((currentRound.endTime - now) / 1000))
      io.emit('round_timer', { remaining })
      if (remaining <= 0) {
        clearInterval(currentRound.timerInterval)
        finalizeRound()
      }
    }, 500)
    sendNextWordToPlayer()
    Object.values(players).forEach(p => {
      if (p.id !== playerId) {
        io.to(p.id).emit('show_round_other', { endTime: currentRound.endTime })
      }
    })
  })
  socket.on('correct', () => {
    if (!currentRound) return
    if (socket.id !== currentRound.playerId) return
    if (!currentRound.currentWord) return
    const w = currentRound.currentWord
    currentRound.solved.push(w)
    usedWords.add(w)
    const player = players[currentRound.playerId]
    if (player && player.team === 'team1') points.team1 += 1
    if (player && player.team === 'team2') points.team2 += 1
    currentRound.currentWord = null
    sendNextWordToPlayer()
    broadcastLobby()
  })
  socket.on('skip', () => {
    if (!currentRound) return
    if (socket.id !== currentRound.playerId) return
    if (!currentRound.currentWord) return
    const w = currentRound.currentWord
    currentRound.skipped.push(w)
    usedWords.add(w)
    currentRound.currentWord = null
    io.to(socket.id).emit('skipping')
    setTimeout(() => {
      sendNextWordToPlayer()
    }, 3000)
  })
  socket.on('advance', () => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    io.emit('show_screen', { screen: '3', points })
  })
  socket.on('admin_nav', ({ screen }) => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    io.to(socket.id).emit('show_screen', { screen })
  })
  socket.on('reset_all', () => {
    const actor = players[socket.id]
    if (!actor || actor.role !== 'admin') return
    resetAll()
  })
  socket.on('disconnect', () => {
    delete players[socket.id]
    broadcastLobby()
  })
  function sendNextWordToPlayer() {
    if (!currentRound) return
    while (currentRound.queue.length > 0) {
      const next = currentRound.queue.shift()
      if (!usedWords.has(next)) {
        currentRound.currentWord = next
        io.to(currentRound.playerId).emit('new_word', { word: next, endTime: currentRound.endTime })
        return
      }
    }
    currentRound.currentWord = null
    finalizeRound()
  }
  function finalizeRound() {
    if (!currentRound) return
    const payload = {
      solved: currentRound.solved,
      skipped: currentRound.skipped,
      points
    }
    io.emit('round_end', payload)
    currentRound = null
    broadcastLobby()
  }
})
const port = process.env.PORT || 3000
server.listen(port)
