const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
app.use(express.static('public'))
let players = {}
let team1 = []
let team2 = []
let scores = { team1: 0, team2: 0 }
let selectedCategory = null
let selectedPlayerId = null
let roundActive = false
let roundTimer = null
let roundEndTime = null
let usedWords = {}
let wordsData = require('./public/words.json')
function visibleName(raw){
  return raw.replace(/995/gi,'').replace(/admin/gi,'').trim() || 'Player'
}
function resetAll(){
  players = {}
  team1 = []
  team2 = []
  scores = { team1: 0, team2: 0 }
  selectedCategory = null
  selectedPlayerId = null
  roundActive = false
  if(roundTimer) clearInterval(roundTimer)
  roundTimer = null
  roundEndTime = null
  usedWords = {}
  io.emit('reset')
}
function pickWord(category){
  if(!category) return null
  let pool = (wordsData[category] || []).filter(w => !usedWords[w])
  if(pool.length === 0) return null
  let idx = Math.floor(Math.random()*pool.length)
  let w = pool[idx]
  usedWords[w] = { status: 'inplay' }
  return w
}
io.on('connection', socket=>{
  socket.on('join', name=>{
    let isAdmin = /995/.test(name)
    players[socket.id] = {
      id: socket.id,
      rawName: name,
      name: visibleName(name),
      team: null,
      isAdmin
    }
    socket.emit('joined', { id: socket.id, name: players[socket.id].name, isAdmin })
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })
  socket.on('chooseTeam', team=>{
    let p = players[socket.id]
    if(!p) return
    if(team === 1){
      p.team = 1
      team1 = Array.from(new Set([...team1, socket.id]))
      team2 = team2.filter(id=>id!==socket.id)
    } else {
      p.team = 2
      team2 = Array.from(new Set([...team2, socket.id]))
      team1 = team1.filter(id=>id!==socket.id)
    }
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })
  socket.on('selectCategory', cat=>{
    let p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    selectedCategory = cat
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })
  socket.on('selectPlayer', playerId=>{
    let p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    if(players[playerId]) selectedPlayerId = playerId
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })
  socket.on('startRound', ()=>{
    let p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    if(!selectedCategory || !selectedPlayerId) return
    roundActive = true
    roundEndTime = Date.now() + 75000
    let firstWord = pickWord(selectedCategory)
    io.emit('roundStarted', { selectedPlayerId, endTime: roundEndTime })
    if(firstWord){
      io.to(selectedPlayerId).emit('word', firstWord)
    } else {
      io.to(selectedPlayerId).emit('word', null)
    }
    roundTimer = setInterval(()=>{
      let remaining = Math.max(0, Math.ceil((roundEndTime - Date.now())/1000))
      io.emit('timer', remaining)
      if(remaining <= 0){
        clearInterval(roundTimer)
        roundTimer = null
        roundActive = false
        let summary = Object.keys(usedWords).map(w=>({word:w,status:usedWords[w].status}))
        io.emit('roundEnded', { summary, scores })
        selectedCategory = null
        selectedPlayerId = null
      }
    }, 250)
  })
  socket.on('acertou', ()=>{
    let p = players[socket.id]
    if(!p || !roundActive) return
    if(p.team === 1) scores.team1 += 1
    if(p.team === 2) scores.team2 += 1
    io.emit('scores', scores)
    let next = pickWord(selectedCategory)
    if(next){
      socket.emit('word', next)
    } else {
      socket.emit('word', null)
    }
  })
  socket.on('pular', ()=>{
    let p = players[socket.id]
    if(!p || !roundActive) return
    let last = Object.keys(usedWords).reverse().find(k=>usedWords[k].status === 'inplay')
    if(last) usedWords[last].status = 'skipped'
    io.emit('updateUsed', Object.keys(usedWords).map(w=>({word:w,status:usedWords[w].status})))
    socket.emit('puling')
    setTimeout(()=>{
      let next = pickWord(selectedCategory)
      if(next) socket.emit('word', next)
      else socket.emit('word', null)
    }, 3000)
  })
  socket.on('requestState', ()=>{
    socket.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
    socket.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
  })
  socket.on('disconnect', ()=>{
    let p = players[socket.id]
    if(p && p.isAdmin){
      resetAll()
      return
    }
    delete players[socket.id]
    team1 = team1.filter(id=>id!==socket.id)
    team2 = team2.filter(id=>id!==socket.id)
    io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })
})
server.listen(3000)
