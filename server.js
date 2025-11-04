const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const words = JSON.parse(fs.readFileSync(path.join(__dirname,'public','words.json')))
let state = {
  gameStarted:false,
  teams:[],
  scores:{},
  players:{},
  adminSocketId:null,
  startTime:null,
  usedWords:[],
  wordHistory:[],
  currentRound:null,
  roundTimer:null,
  gameResetTimer:null
}
app.use(express.static(path.join(__dirname,'public')))
function resetGame(){
  clearTimeout(state.roundTimer)
  clearTimeout(state.gameResetTimer)
  state = {
    gameStarted:false,
    teams:[],
    scores:{},
    players:{},
    adminSocketId:null,
    startTime:null,
    usedWords:[],
    wordHistory:[],
    currentRound:null,
    roundTimer:null,
    gameResetTimer:null
  }
  io.emit('state',publicState())
}
function publicState(){
  return {
    gameStarted:state.gameStarted,
    teams:state.teams,
    scores:state.scores,
    players:Object.values(state.players).map(p=>({id:p.id,name:p.name})),
    wordHistory:state.wordHistory,
    currentRound: state.currentRound ? {playerId: state.currentRound.playerId, category: state.currentRound.category, team: state.currentRound.team, endsAt: state.currentRound.endsAt} : null,
    startTime: state.startTime
  }
}
function pickWord(category){
  const pool = words[category] || []
  const available = pool.filter(w=>!state.usedWords.includes(w))
  if(available.length===0) return null
  const w = available[Math.floor(Math.random()*available.length)]
  state.usedWords.push(w)
  return w
}
function endRound(){
  if(!state.currentRound) return
  clearTimeout(state.roundTimer)
  const cr = state.currentRound
  state.currentRound = null
  io.emit('roundEnded', {playerId: cr.playerId})
  io.emit('state', publicState())
}
io.on('connection', socket=>{
  socket.on('setName', name=>{
    state.players[socket.id] = {id:socket.id,name:name||'Anon'}
    io.emit('players', Object.values(state.players).map(p=>({id:p.id,name:p.name})))
    socket.emit('state', publicState())
  })
  socket.on('startGame', data=>{
    if(state.gameStarted) return
    if(data.password !== '12345678') {
      socket.emit('startFailed')
      return
    }
    state.gameStarted = true
    state.adminSocketId = socket.id
    state.teams = [data.team1||'Equipe 1', data.team2||'Equipe 2']
    state.scores = {}
    state.scores[state.teams[0]] = 0
    state.scores[state.teams[1]] = 0
    state.startTime = Date.now()
    state.gameResetTimer = setTimeout(()=>resetGame(), 3600000)
    io.emit('gameStarted', {teams:state.teams, adminId: state.adminSocketId})
    io.emit('state', publicState())
    io.to(socket.id).emit('youAreAdmin')
  })
  socket.on('startRound', data=>{
    if(socket.id !== state.adminSocketId) return
    if(!state.gameStarted) return
    const playerId = data.playerId
    const category = data.category
    const team = data.team
    if(!state.players[playerId]) return
    if(!state.teams.includes(team)) return
    if(state.currentRound) return
    const firstWord = pickWord(category)
    state.currentRound = {playerId, category, team, word:firstWord, endsAt: Date.now()+75000, skipLock:false}
    state.roundTimer = setTimeout(()=> endRound(), 75000)
    io.emit('roundStarted', {playerId, category, team, endsAt: state.currentRound.endsAt})
    if(firstWord){
      io.to(playerId).emit('roundWord', {word:firstWord, timeLeft:75})
    } else {
      io.to(playerId).emit('roundWord', {word:null, timeLeft:75})
    }
    io.emit('state', publicState())
  })
  socket.on('hit', ()=>{
    if(!state.currentRound) return
    if(socket.id !== state.currentRound.playerId) return
    const cr = state.currentRound
    if(!cr.word) return
    state.scores[cr.team] = (state.scores[cr.team]||0)+1
    state.wordHistory.push({word:cr.word, result:'acertou', player: state.players[socket.id]?.name||'Anon', team:cr.team, timestamp: Date.now()})
    const next = pickWord(cr.category)
    cr.word = next
    io.emit('scoreUpdate', state.scores)
    io.emit('wordHistory', state.wordHistory)
    if(next){
      io.to(cr.playerId).emit('roundWord', {word:next, timeLeft: Math.max(0, Math.floor((cr.endsAt-Date.now())/1000))})
    } else {
      endRound()
    }
    io.emit('state', publicState())
  })
  socket.on('skip', ()=>{
    if(!state.currentRound) return
    if(socket.id !== state.currentRound.playerId) return
    const cr = state.currentRound
    if(cr.skipLock) return
    state.wordHistory.push({word:cr.word, result:'pulou', player: state.players[socket.id]?.name||'Anon', team:cr.team, timestamp: Date.now()})
    cr.skipLock = true
    io.emit('wordHistory', state.wordHistory)
    io.emit('skipStarted', {playerId: cr.playerId})
    setTimeout(()=>{
      cr.skipLock = false
      const next = pickWord(cr.category)
      cr.word = next
      if(next){
        io.to(cr.playerId).emit('roundWord', {word:next, timeLeft: Math.max(0, Math.floor((cr.endsAt-Date.now())/1000))})
      } else {
        endRound()
      }
      io.emit('state', publicState())
    },3000)
  })
  socket.on('resetGame', ()=>{
    if(socket.id !== state.adminSocketId) return
    resetGame()
  })
  socket.on('requestState', ()=>{
    socket.emit('state', publicState())
  })
  socket.on('disconnect', ()=>{
    delete state.players[socket.id]
    if(socket.id === state.adminSocketId){
      state.adminSocketId = null
      io.emit('adminDisconnected')
    }
    io.emit('players', Object.values(state.players).map(p=>({id:p.id,name:p.name})))
  })
  socket.emit('state', publicState())
  io.emit('players', Object.values(state.players).map(p=>({id:p.id,name:p.name})))
})
server.listen(3000)
