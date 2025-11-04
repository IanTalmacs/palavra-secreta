const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PORT = process.env.PORT || 3000
const WORDS_PATH = path.join(__dirname, 'public', 'words.json')
function loadInitialWords() {
  try {
    const raw = fs.readFileSync(WORDS_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}
let initialWords = loadInitialWords()
let wordsPool = JSON.parse(JSON.stringify(initialWords))
let teams = { a: { name: 'Equipe A', score: 0 }, b: { name: 'Equipe B', score: 0 } }
let players = {}
let drawnWordsLastRound = []
let currentRound = { active: false, playerId: null, teamKey: null, category: null, timeout: null, skipTimeout: null, endAt: null }
app.use(express.static(path.join(__dirname, 'public')))
function broadcastState() {
  const publicPlayers = Object.entries(players).map(([id, p]) => ({ id, name: p.name }))
  io.emit('state', {
    teams,
    players: publicPlayers,
    categories: Object.keys(initialWords).map(cat => ({ name: cat, remaining: (wordsPool[cat]||[]).length })),
    drawnWordsLastRound,
    currentRound: { active: currentRound.active, playerId: currentRound.playerId, teamKey: currentRound.teamKey, category: currentRound.category, endAt: currentRound.endAt }
  })
}
function resetGame() {
  wordsPool = JSON.parse(JSON.stringify(initialWords))
  teams = { a: { name: 'Equipe A', score: 0 }, b: { name: 'Equipe B', score: 0 } }
  drawnWordsLastRound = []
  if (currentRound.timeout) clearTimeout(currentRound.timeout)
  if (currentRound.skipTimeout) clearTimeout(currentRound.skipTimeout)
  currentRound = { active: false, playerId: null, teamKey: null, category: null, timeout: null, skipTimeout: null, endAt: null }
  broadcastState()
}
function drawWord(category) {
  if (!wordsPool[category] || wordsPool[category].length === 0) return null
  const idx = Math.floor(Math.random() * wordsPool[category].length)
  const word = wordsPool[category].splice(idx, 1)[0]
  drawnWordsLastRound.push(word)
  io.emit('drawnWordsUpdate', drawnWordsLastRound.slice())
  return word
}
io.on('connection', socket => {
  players[socket.id] = { name: 'Jogador', isAdmin: false }
  socket.emit('init', { id: socket.id })
  broadcastState()
  socket.on('setName', name => {
    if (typeof name !== 'string') return
    players[socket.id].name = name
    if (name.trim().toLowerCase() === 'admin') players[socket.id].isAdmin = true
    socket.emit('you', { id: socket.id, isAdmin: !!players[socket.id].isAdmin })
    broadcastState()
  })
  socket.on('renameTeams', data => {
    if (!players[socket.id].isAdmin) return
    if (typeof data.a === 'string' && data.a.trim() !== '') teams.a.name = data.a
    if (typeof data.b === 'string' && data.b.trim() !== '') teams.b.name = data.b
    broadcastState()
  })
  socket.on('resetGame', () => {
    if (!players[socket.id].isAdmin) return
    resetGame()
  })
  socket.on('startRound', ({ playerId, category, teamKey }) => {
    if (!players[socket.id].isAdmin) return
    if (currentRound.active) return
    if (!players[playerId]) return
    if (!initialWords[category]) return
    if (!['a','b'].includes(teamKey)) return
    drawnWordsLastRound = []
    io.emit('clearDrawnWords')
    currentRound.active = true
    currentRound.playerId = playerId
    currentRound.teamKey = teamKey
    currentRound.category = category
    currentRound.endAt = Date.now() + 75000
    broadcastState()
    const firstWord = drawWord(category)
    if (!firstWord) {
      io.to(playerId).emit('roundEnd', { reason: 'no-words' })
      currentRound.active = false
      currentRound.playerId = null
      currentRound.category = null
      currentRound.teamKey = null
      currentRound.endAt = null
      broadcastState()
      return
    }
    io.to(playerId).emit('showRoundPopup', { word: firstWord, timeLeft: 75 })
    currentRound.timeout = setTimeout(() => {
      io.to(currentRound.playerId).emit('roundEnd', { reason: 'time-up' })
      currentRound.active = false
      currentRound.playerId = null
      currentRound.category = null
      currentRound.teamKey = null
      currentRound.endAt = null
      broadcastState()
    }, 75000)
    broadcastState()
  })
  socket.on('correct', () => {
    if (!currentRound.active) return
    if (socket.id !== currentRound.playerId) return
    if (!currentRound.teamKey) return
    teams[currentRound.teamKey].score += 1
    const nextWord = drawWord(currentRound.category)
    broadcastState()
    if (!nextWord) {
      io.to(socket.id).emit('roundEnd', { reason: 'no-words' })
      if (currentRound.timeout) clearTimeout(currentRound.timeout)
      currentRound.active = false
      currentRound.playerId = null
      currentRound.category = null
      currentRound.teamKey = null
      currentRound.endAt = null
      broadcastState()
      return
    }
    io.to(socket.id).emit('roundWord', { word: nextWord })
  })
  socket.on('skip', () => {
    if (!currentRound.active) return
    if (socket.id !== currentRound.playerId) return
    io.to(socket.id).emit('skipping')
    if (currentRound.skipTimeout) clearTimeout(currentRound.skipTimeout)
    currentRound.skipTimeout = setTimeout(() => {
      const nextWord = drawWord(currentRound.category)
      broadcastState()
      if (!nextWord) {
        io.to(socket.id).emit('roundEnd', { reason: 'no-words' })
        if (currentRound.timeout) clearTimeout(currentRound.timeout)
        currentRound.active = false
        currentRound.playerId = null
        currentRound.category = null
        currentRound.teamKey = null
        currentRound.endAt = null
        broadcastState()
        return
      }
      io.to(socket.id).emit('roundWord', { word: nextWord })
    }, 3000)
  })
  socket.on('disconnect', () => {
    delete players[socket.id]
    if (currentRound.playerId === socket.id) {
      if (currentRound.timeout) clearTimeout(currentRound.timeout)
      if (currentRound.skipTimeout) clearTimeout(currentRound.skipTimeout)
      currentRound = { active: false, playerId: null, teamKey: null, category: null, timeout: null, skipTimeout: null, endAt: null }
    }
    broadcastState()
  })
})
server.listen(PORT)
