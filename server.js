const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
const fs = require('fs')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const WORDS_PATH = path.join(__dirname, 'public', 'words.json')
let wordsByCategory = {}
try {
  wordsByCategory = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'))
} catch (e) {
  wordsByCategory = {}
}
app.use(express.static(path.join(__dirname, 'public')))
const PORT = process.env.PORT || 3000
let players = {}
let teams = []
let selections = { category: null, playerId: null, teamId: null }
let gamePhase = { namingVisible: true, superiorVisible: false, categoriasVisible: false }
let usedWords = new Set()
let roundState = { active: false, playerId: null, teamId: null, category: null, endTime: null, words: [] }
let adminSocketId = null
let lastActivity = Date.now()
function publicPlayers() {
  return Object.values(players).map(p => ({ id: p.id, name: p.name, teamId: p.teamId || null }))
}
function broadcastState() {
  io.emit('state', {
    players: publicPlayers(),
    teams: teams.map(t => ({ id: t.id, name: t.name, score: t.score })),
    selections: selections,
    phase: gamePhase,
    categories: Object.keys(wordsByCategory)
  })
}
function resetGameAll() {
  players = {}
  teams = []
  selections = { category: null, playerId: null, teamId: null }
  gamePhase = { namingVisible: true, superiorVisible: false, categoriasVisible: false }
  usedWords = new Set()
  roundState = { active: false, playerId: null, teamId: null, category: null, endTime: null, words: [] }
  adminSocketId = null
  io.emit('reset')
  broadcastState()
}
function pickWord(category) {
  const list = wordsByCategory[category] || []
  const available = list.filter(w => !usedWords.has(category + '||' + w))
  if (available.length === 0) return null
  const choice = available[Math.floor(Math.random() * available.length)]
  usedWords.add(category + '||' + choice)
  return choice
}
function startRoundFromSelections() {
  if (!selections.category || !selections.playerId || !selections.teamId) return
  roundState.active = true
  roundState.playerId = selections.playerId
  roundState.teamId = selections.teamId
  roundState.category = selections.category
  roundState.words = []
  const now = Date.now()
  roundState.endTime = now + 75000
  const first = pickWord(roundState.category)
  roundState.words.push({ word: first || '[SEM PALAVRAS]', status: 'current' })
  gamePhase.categoriasVisible = false
  gamePhase.superiorVisible = true
  gamePhase.namingVisible = false
  broadcastState()
  io.emit('round_started', { playerId: roundState.playerId, teamId: roundState.teamId, category: roundState.category, endTime: roundState.endTime })
  io.to(roundState.playerId).emit('round_word', { word: first || '[SEM PALAVRAS]', scores: teams.map(t => ({ id: t.id, score: t.score })) })
  const timer = setTimeout(() => {
    endRound()
  }, 75000)
  roundState._timer = timer
}
function endRound() {
  if (!roundState.active) return
  roundState.active = false
  clearTimeout(roundState._timer)
  roundState.words = roundState.words.map(w => {
    if (w.status === 'current') return { word: w.word, status: 'acertou' }
    return w
  })
  gamePhase.categoriasVisible = false
  gamePhase.superiorVisible = true
  io.emit('round_ended', { words: roundState.words.map(w => ({ word: w.word, status: w.status })), scores: teams.map(t => ({ id: t.id, score: t.score })) })
  selections = { category: null, playerId: null, teamId: null }
  broadcastState()
}
function touch() {
  lastActivity = Date.now()
}
setInterval(() => {
  if (Date.now() - lastActivity > 3600000) {
    resetGameAll()
  }
}, 60000)
io.on('connection', socket => {
  socket.onAny(() => touch())
  socket.on('join', name => {
    const isAdmin = typeof name === 'string' && name.toLowerCase().includes('admin')
    players[socket.id] = { id: socket.id, name: name || ('Player-' + socket.id.slice(0,4)), teamId: null }
    if (isAdmin && !adminSocketId) {
      adminSocketId = socket.id
      players[socket.id].isAdmin = true
      socket.emit('you_are_admin')
    }
    broadcastState()
  })
  socket.on('admin_set_teams', data => {
    if (socket.id !== adminSocketId) return
    teams = [
      { id: 'team1', name: data.team1 || 'Equipe 1', score: 0 },
      { id: 'team2', name: data.team2 || 'Equipe 2', score: 0 }
    ]
    broadcastState()
  })
  socket.on('admin_start_game', () => {
    if (socket.id !== adminSocketId) return
    gamePhase.namingVisible = false
    gamePhase.superiorVisible = true
    gamePhase.categoriasVisible = true
    broadcastState()
  })
  socket.on('admin_reset', () => {
    if (socket.id !== adminSocketId) return
    resetGameAll()
  })
  socket.on('select', ({ type, id }) => {
    if (socket.id !== adminSocketId) return
    if (type === 'category') selections.category = id
    if (type === 'player') selections.playerId = id
    if (type === 'team') selections.teamId = id
    io.emit('selections', selections)
  })
  socket.on('admin_start_round', () => {
    if (socket.id !== adminSocketId) return
    if (!selections.category || !selections.playerId || !selections.teamId) return
    startRoundFromSelections()
  })
  socket.on('hit', () => {
    if (!roundState.active) return
    if (socket.id !== roundState.playerId) return
    const team = teams.find(t => t.id === roundState.teamId)
    if (team) team.score += 1
    const current = roundState.words.find(w => w.status === 'current')
    if (current) {
      current.status = 'acertou'
    }
    const next = pickWord(roundState.category)
    if (next) {
      roundState.words.push({ word: next, status: 'current' })
      io.to(roundState.playerId).emit('round_word', { word: next, scores: teams.map(t => ({ id: t.id, score: t.score })) })
    } else {
      io.to(roundState.playerId).emit('round_word', { word: '[SEM PALAVRAS]', scores: teams.map(t => ({ id: t.id, score: t.score })) })
    }
    broadcastState()
  })
  socket.on('skip', () => {
    if (!roundState.active) return
    if (socket.id !== roundState.playerId) return
    const current = roundState.words.find(w => w.status === 'current')
    if (current) {
      current.status = 'pulou'
    }
    io.to(roundState.playerId).emit('skipping')
    setTimeout(() => {
      const next = pickWord(roundState.category)
      if (next) {
        roundState.words.push({ word: next, status: 'current' })
        io.to(roundState.playerId).emit('round_word', { word: next, scores: teams.map(t => ({ id: t.id, score: t.score })) })
      } else {
        io.to(roundState.playerId).emit('round_word', { word: '[SEM PALAVRAS]', scores: teams.map(t => ({ id: t.id, score: t.score })) })
      }
    }, 3000)
  })
  socket.on('admin_continue', () => {
    if (socket.id !== adminSocketId) return
    gamePhase.categoriasVisible = true
    gamePhase.superiorVisible = true
    selections = { category: null, playerId: null, teamId: null }
    roundState.words = []
    io.emit('hide_verification')
    broadcastState()
  })
  socket.on('choose_team', teamId => {
    if (players[socket.id]) {
      players[socket.id].teamId = teamId
      broadcastState()
    }
  })
  socket.on('disconnect', () => {
    if (players[socket.id] && players[socket.id].isAdmin) {
      adminSocketId = null
    }
    delete players[socket.id]
    broadcastState()
  })
  socket.emit('connected', { id: socket.id })
  broadcastState()
})
server.listen(PORT)
