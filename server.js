// server.js
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PUBLIC = path.join(__dirname, 'public')
app.use(express.static(PUBLIC))
let rawWords = {}
function loadWords() {
  try {
    rawWords = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'words.json')))
  } catch (e) {
    rawWords = {}
  }
}
loadWords()
let state = {
  players: {},
  teams: ['', ''],
  scores: { '0': 0, '1': 0 },
  selected: { category: null, playerId: null, teamIndex: null },
  phase: 'init',
  usedWords: new Set(),
  currentRound: null,
  lastActivity: Date.now()
}
function resetAll() {
  state.players = {}
  state.teams = ['', '']
  state.scores = { '0': 0, '1': 0 }
  state.selected = { category: null, playerId: null, teamIndex: null }
  state.phase = 'init'
  state.usedWords = new Set()
  state.currentRound = null
  state.lastActivity = Date.now()
  loadWords()
  io.emit('resetAll')
  emitState()
}
function emitState() {
  const players = Object.values(state.players).map(p => ({ id: p.id, name: p.name }))
  io.emit('state', { players, teams: state.teams, scores: state.scores, phase: state.phase, selected: { category: state.selected.category, playerId: state.selected.playerId, teamIndex: state.selected.teamIndex } })
}
setInterval(() => {
  if (Date.now() - state.lastActivity > 1000 * 60 * 60) {
    resetAll()
  }
}, 60 * 1000)
io.on('connection', socket => {
  socket.on('join', data => {
    state.lastActivity = Date.now()
    const name = (data.name || '').trim().slice(0,40)
    const isAdmin = name.toLowerCase().includes('admin')
    state.players[socket.id] = { id: socket.id, name, isAdmin }
    if (isAdmin && data.teams && data.teams.length === 2) {
      state.teams = [String(data.teams[0]).slice(0,30), String(data.teams[1]).slice(0,30)]
      state.scores = { '0': 0, '1': 0 }
    }
    socket.emit('joined', { id: socket.id, isAdmin, teams: state.teams })
    emitState()
  })
  socket.on('select', data => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !p.isAdmin) return
    if (data.type === 'category') state.selected.category = data.value
    if (data.type === 'player') state.selected.playerId = data.value
    if (data.type === 'team') state.selected.teamIndex = data.value
    io.emit('selectionUpdate', { category: state.selected.category, playerId: state.selected.playerId, teamIndex: state.selected.teamIndex })
    emitState()
  })
  socket.on('startRound', () => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !p.isAdmin) return
    if (!state.selected.category || !state.selected.playerId || typeof state.selected.teamIndex !== 'number') return
    const category = state.selected.category
    const pool = Array.isArray(rawWords[category]) ? rawWords[category] : []
    const available = pool.filter(w => !state.usedWords.has(category + '||' + w))
    if (available.length === 0) {
      io.emit('noWords', { category })
      return
    }
    const word = available[Math.floor(Math.random() * available.length)]
    state.usedWords.add(category + '||' + word)
    state.phase = 'round'
    state.currentRound = {
      category,
      playerId: state.selected.playerId,
      teamIndex: state.selected.teamIndex,
      words: [{ word, status: 'current' }],
      start: Date.now(),
      remaining: 75,
      timer: null,
      skipTimeout: null
    }
    io.emit('hideCategorias')
    io.to(state.currentRound.playerId).emit('startRound', { word, remaining: 75 })
    state.currentRound.timer = setInterval(() => {
      state.currentRound.remaining = 75 - Math.floor((Date.now() - state.currentRound.start) / 1000)
      if (state.currentRound.remaining <= 0) {
        clearInterval(state.currentRound.timer)
        state.phase = 'verification'
        const results = state.currentRound.words.map(w => ({ word: w.word, status: w.status === 'current' ? 'correct' : w.status }))
        io.emit('roundEnd', { results, teamIndex: state.currentRound.teamIndex, points: state.scores })
        state.currentRound = null
        emitState()
      } else {
        io.to(state.currentRound.playerId).emit('tick', { remaining: state.currentRound.remaining })
      }
    }, 500)
    emitState()
  })
  socket.on('correct', () => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !state.currentRound) return
    if (socket.id !== state.currentRound.playerId) return
    state.currentRound.words[state.currentRound.words.length - 1].status = 'correct'
    state.scores[String(state.currentRound.teamIndex)] = (state.scores[String(state.currentRound.teamIndex)] || 0) + 1
    const pool = Array.isArray(rawWords[state.currentRound.category]) ? rawWords[state.currentRound.category] : []
    const available = pool.filter(w => !state.usedWords.has(state.currentRound.category + '||' + w))
    if (available.length === 0) {
      io.to(state.currentRound.playerId).emit('noWords', { category: state.currentRound.category })
      io.emit('scoreUpdate', { scores: state.scores })
      emitState()
      return
    }
    const word = available[Math.floor(Math.random() * available.length)]
    state.usedWords.add(state.currentRound.category + '||' + word)
    state.currentRound.words.push({ word, status: 'current' })
    io.to(state.currentRound.playerId).emit('newWord', { word })
    io.emit('scoreUpdate', { scores: state.scores })
    emitState()
  })
  socket.on('skip', () => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !state.currentRound) return
    if (socket.id !== state.currentRound.playerId) return
    state.currentRound.words[state.currentRound.words.length - 1].status = 'skipped'
    io.to(state.currentRound.playerId).emit('skipping')
    if (state.currentRound.skipTimeout) clearTimeout(state.currentRound.skipTimeout)
    state.currentRound.skipTimeout = setTimeout(() => {
      const pool = Array.isArray(rawWords[state.currentRound.category]) ? rawWords[state.currentRound.category] : []
      const available = pool.filter(w => !state.usedWords.has(state.currentRound.category + '||' + w))
      if (available.length === 0) {
        io.to(state.currentRound.playerId).emit('noWords', { category: state.currentRound.category })
        return
      }
      const word = available[Math.floor(Math.random() * available.length)]
      state.usedWords.add(state.currentRound.category + '||' + word)
      state.currentRound.words.push({ word, status: 'current' })
      io.to(state.currentRound.playerId).emit('newWord', { word })
    }, 3000)
    emitState()
  })
  socket.on('continue', () => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !p.isAdmin) return
    state.selected = { category: null, playerId: null, teamIndex: null }
    state.phase = 'categories'
    io.emit('showCategorias')
    emitState()
  })
  socket.on('requestState', () => {
    state.lastActivity = Date.now()
    const players = Object.values(state.players).map(p => ({ id: p.id, name: p.name }))
    socket.emit('state', { players, teams: state.teams, scores: state.scores, phase: state.phase, selected: { category: state.selected.category, playerId: state.selected.playerId, teamIndex: state.selected.teamIndex } })
  })
  socket.on('reset', () => {
    state.lastActivity = Date.now()
    const p = state.players[socket.id]
    if (!p || !p.isAdmin) return
    resetAll()
  })
  socket.on('disconnect', () => {
    state.lastActivity = Date.now()
    delete state.players[socket.id]
    if (state.selected.playerId === socket.id) state.selected.playerId = null
    emitState()
  })
})
server.listen(process.env.PORT || 3000)
