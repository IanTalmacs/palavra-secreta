const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PORT = process.env.PORT || 3000
const WORDS = JSON.parse(fs.readFileSync(path.join(__dirname,'public','words.json'),'utf8'))
let game = {
  started: false,
  createdAt: null,
  expiresAt: null,
  adminId: null,
  teams: {teamA:{name:'Equipe A',score:0},teamB:{name:'Equipe B',score:0}},
  players: {},
  usedWords: new Set(),
  guessedWords: [],
  skippedWords: [],
  currentRound: null,
  expiryTimeout: null,
  roundTimeout: null
}
function resetGame(){
  game.started = false
  game.createdAt = null
  game.expiresAt = null
  game.adminId = null
  game.teams = {teamA:{name:'Equipe A',score:0},teamB:{name:'Equipe B',score:0}}
  game.players = {}
  game.usedWords = new Set()
  game.guessedWords = []
  game.skippedWords = []
  game.currentRound = null
  if(game.expiryTimeout){ clearTimeout(game.expiryTimeout); game.expiryTimeout = null }
  if(game.roundTimeout){ clearTimeout(game.roundTimeout); game.roundTimeout = null }
}
function pickWord(category){
  const list = WORDS[category] || []
  const available = list.filter(w=>!game.usedWords.has(`${category}||${w}`))
  if(available.length===0) return null
  const w = available[Math.floor(Math.random()*available.length)]
  game.usedWords.add(`${category}||${w}`)
  return w
}
app.use(express.static(path.join(__dirname,'public')))
io.on('connection',(socket)=>{
  socket.on('register',(name)=>{
    game.players[socket.id] = {id:socket.id,name:name||'Anon'}
    io.emit('players',Object.values(game.players))
    socket.emit('gameState', {
      started: game.started,
      teams: game.teams,
      guessedWords: game.guessedWords,
      skippedWords: game.skippedWords,
      admin: socket.id===game.adminId,
      currentRound: game.currentRound,
      expiresAt: game.expiresAt,
      adminId: game.adminId
    })
  })
  socket.on('startGame',(data)=>{
    if(game.started) return
    const {teamA,teamB,password} = data
    if(password !== '12345678'){
      socket.emit('startFailed','Senha incorreta')
      return
    }
    game.teams.teamA.name = teamA || 'Equipe A'
    game.teams.teamB.name = teamB || 'Equipe B'
    game.started = true
    game.createdAt = Date.now()
    game.expiresAt = Date.now() + 3600000
    game.adminId = socket.id
    game.expiryTimeout = setTimeout(()=>{
      resetGame()
      io.emit('resetAll')
    },3600000)
    io.emit('gameStarted',{teams:game.teams,adminId:game.adminId})
    io.emit('players',Object.values(game.players))
  })
  socket.on('startRound',(data)=>{
    if(socket.id !== game.adminId) return
    if(game.currentRound) return
    const {playerId,category,teamKey} = data
    if(!game.players[playerId]) return
    const word = pickWord(category)
    const endTime = Date.now()+75000
    game.currentRound = {
      playerId,
      category,
      teamKey,
      currentWord: word,
      endTime
    }
    io.to(playerId).emit('yourTurn',{word,category,endTime})
    io.emit('roundInfo',{player:game.players[playerId],category,teamKey,endTime})
    game.roundTimeout = setTimeout(()=>{ endRound() },75000)
  })
  socket.on('correct',()=>{
    if(!game.currentRound) return
    if(socket.id !== game.currentRound.playerId) return
    const teamKey = game.currentRound.teamKey
    if(game.teams[teamKey]) game.teams[teamKey].score += 1
    if(game.currentRound.currentWord){
      game.guessedWords.push({word:game.currentRound.currentWord,player:game.players[socket.id].name,team:game.teams[teamKey].name})
    }
    io.emit('updateScores',{teams:game.teams,guessed:game.guessedWords,skipped:game.skippedWords})
    const next = pickWord(game.currentRound.category)
    if(!next){
      endRound()
      return
    }
    game.currentRound.currentWord = next
    io.to(game.currentRound.playerId).emit('nextWord',{word:next})
  })
  socket.on('skip',()=>{
    if(!game.currentRound) return
    if(socket.id !== game.currentRound.playerId) return
    if(game.currentRound.currentWord){
      game.skippedWords.push({word:game.currentRound.currentWord,player:game.players[socket.id].name,team:game.teams[game.currentRound.teamKey].name})
    }
    io.emit('updateScores',{teams:game.teams,guessed:game.guessedWords,skipped:game.skippedWords})
    io.to(game.currentRound.playerId).emit('skipping')
    setTimeout(()=>{
      const next = pickWord(game.currentRound.category)
      if(!next){
        endRound()
        return
      }
      game.currentRound.currentWord = next
      io.to(game.currentRound.playerId).emit('nextWord',{word:next})
    },3000)
  })
  socket.on('resetGame',()=>{
    if(socket.id !== game.adminId) return
    resetGame()
    io.emit('resetAll')
  })
  socket.on('disconnect',()=>{
    delete game.players[socket.id]
    if(socket.id === game.adminId) game.adminId = null
    io.emit('players',Object.values(game.players))
  })
  function endRound(){
    if(game.roundTimeout){ clearTimeout(game.roundTimeout); game.roundTimeout = null }
    game.currentRound = null
    io.emit('roundEnded',{teams:game.teams,guessed:game.guessedWords,skipped:game.skippedWords})
  }
})
server.listen(PORT)
