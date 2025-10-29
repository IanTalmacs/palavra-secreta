const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static(path.join(__dirname,'public')))

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
let wordsData = {}
try {
  wordsData = require(path.join(__dirname,'public','words.json'))
} catch (err) {
  console.error('Erro ao carregar words.json:', err.message)
  wordsData = {}
}

function visibleName(raw){
  if(!raw) return 'Player'
  return String(raw).replace(/995/gi,'').replace(/admin/gi,'').trim() || 'Player'
}

function resetAll(){
  players = {}
  team1 = []
  team2 = []
  scores = { team1: 0, team2: 0 }
  selectedCategory = null
  selectedPlayerId = null
  roundActive = false
  if(roundTimer) { clearInterval(roundTimer); roundTimer = null }
  roundEndTime = null
  usedWords = {}
  io.emit('reset')
  console.log('Jogo reiniciado (resetAll).')
}

function pickWord(category){
  if(!category) return null
  const list = Array.isArray(wordsData[category]) ? wordsData[category] : []
  const pool = list.filter(w => !usedWords[w])
  if(pool.length === 0) return null
  const idx = Math.floor(Math.random()*pool.length)
  const w = pool[idx]
  usedWords[w] = { status: 'inplay' }
  return w
}

process.on('uncaughtException', (err)=>{
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err)
})

process.on('unhandledRejection', (reason, p)=>{
  console.error('Unhandled Rejection at:', p, 'reason:', reason)
})

io.on('connection', socket=>{
  console.log('Novo socket conectado:', socket.id)
  socket.on('join', name=>{
    try {
      const isAdmin = typeof name === 'string' && /995/.test(name)
      players[socket.id] = {
        id: socket.id,
        rawName: name || '',
        name: visibleName(name),
        team: null,
        isAdmin
      }
      socket.emit('joined', { id: socket.id, name: players[socket.id].name, isAdmin })
      io.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
      io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
    } catch (e) {
      console.error('Erro em join:', e)
    }
  })

  socket.on('chooseTeam', team=>{
    const p = players[socket.id]
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
    const p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    if(typeof cat !== 'string') return
    selectedCategory = cat
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })

  socket.on('selectPlayer', playerId=>{
    const p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    if(players[playerId]) selectedPlayerId = playerId
    io.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
  })

  socket.on('startRound', ()=>{
    const p = players[socket.id]
    if(!p || !p.isAdmin || roundActive) return
    if(!selectedCategory || !selectedPlayerId) return
    roundActive = true
    roundEndTime = Date.now() + 75000
    const firstWord = pickWord(selectedCategory)
    io.emit('roundStarted', { selectedPlayerId, endTime: roundEndTime })
    if(firstWord){
      io.to(selectedPlayerId).emit('word', firstWord)
    } else {
      io.to(selectedPlayerId).emit('word', null)
    }
    roundTimer = setInterval(()=>{
      const remaining = Math.max(0, Math.ceil((roundEndTime - Date.now())/1000))
      io.emit('timer', remaining)
      if(remaining <= 0){
        clearInterval(roundTimer)
        roundTimer = null
        roundActive = false
        const summary = Object.keys(usedWords).map(w=>({word:w,status:usedWords[w].status}))
        io.emit('roundEnded', { summary, scores })
        selectedCategory = null
        selectedPlayerId = null
      }
    }, 250)
  })

  socket.on('acertou', ()=>{
    const p = players[socket.id]
    if(!p || !roundActive) return
    if(p.team === 1) scores.team1 += 1
    if(p.team === 2) scores.team2 += 1
    io.emit('scores', scores)
    const next = pickWord(selectedCategory)
    if(next){
      socket.emit('word', next)
    } else {
      socket.emit('word', null)
    }
  })

  socket.on('pular', ()=>{
    const p = players[socket.id]
    if(!p || !roundActive) return
    const last = Object.keys(usedWords).reverse().find(k=>usedWords[k].status === 'inplay')
    if(last) usedWords[last].status = 'skipped'
    io.emit('updateUsed', Object.keys(usedWords).map(w=>({word:w,status:usedWords[w].status})))
    socket.emit('puling')
    setTimeout(()=>{
      const next = pickWord(selectedCategory)
      if(next) socket.emit('word', next)
      else socket.emit('word', null)
    }, 3000)
  })

  socket.on('requestState', ()=>{
    socket.emit('state', { team1, team2, scores, selectedCategory, selectedPlayerId, roundActive })
    socket.emit('players', Object.values(players).map(p=>({id:p.id,name:p.name,team:p.team,isAdmin:p.isAdmin})))
  })

  socket.on('disconnect', ()=>{
    const p = players[socket.id]
    console.log('Socket desconectado:', socket.id, p ? `(${p.name})` : '')
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

const PORT = process.env.PORT || 3000
server.listen(PORT, ()=>console.log(`Servidor rodando na porta ${PORT}`))
