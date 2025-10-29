const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const fs = require('fs')

app.use(express.static('public'))

let players = {}
let words = {}
let usedWords = new Set()
let currentCategory = null
let currentPlayer = null
let scores = { team1: 0, team2: 0 }

function loadWords() {
  words = JSON.parse(fs.readFileSync('public/words.json'))
}
loadWords()

io.on('connection', socket => {
  socket.on('join', ({ name, team }) => {
    const isAdmin = name.includes('995')
    const displayName = name.replace('995', '')
    players[socket.id] = { name: displayName, team, isAdmin, screen: 1 }
    io.emit('players', players)
  })

  socket.on('getCategories', () => {
    socket.emit('categories', Object.keys(words))
  })

  socket.on('chooseCategory', cat => {
    currentCategory = cat
    io.emit('categoryChosen', cat)
  })

  socket.on('choosePlayer', id => {
    currentPlayer = id
    io.emit('playerChosen', id)
  })

  socket.on('startRound', () => {
    if (!currentCategory) return
    usedWords.clear()
    io.emit('roundStarted', currentPlayer)
  })

  socket.on('getWord', () => {
    const available = words[currentCategory].filter(w => !usedWords.has(w))
    if (available.length === 0) {
      socket.emit('noWords')
      return
    }
    const word = available[Math.floor(Math.random() * available.length)]
    usedWords.add(word)
    socket.emit('newWord', word)
  })

  socket.on('correct', team => {
    scores[team]++
    io.emit('updateScore', scores)
  })

  socket.on('endRound', () => {
    io.emit('roundEnded')
    currentPlayer = null
  })

  socket.on('resetGame', () => {
    usedWords.clear()
    scores = { team1: 0, team2: 0 }
    currentPlayer = null
    currentCategory = null
    players = {}
    io.emit('resetAll')
  })

  socket.on('disconnect', () => {
    delete players[socket.id]
    io.emit('players', players)
  })
})

http.listen(process.env.PORT || 3000)
