const socket = io()
let myId = null
let isAdmin = false
let currentScreen = 1
const el = id=>document.getElementById(id)
const switchTo = n=>{
  currentScreen = n
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'))
  el('screen'+n).classList.add('active')
}
el('confirmName').onclick = ()=>{
  const name = el('nameInput').value.trim()
  if(!name) return alert('Digite um nome')
  socket.emit('join', name)
}
el('team1').onclick = ()=>socket.emit('chooseTeam',1)
el('team2').onclick = ()=>socket.emit('chooseTeam',2)
el('btnCategorias').onclick = ()=>{ switchTo(2); socket.emit('requestState') }
el('backCategorias').onclick = ()=>{ switchTo(2); socket.emit('requestState') }
socket.on('joined', data=>{
  myId = data.id
  isAdmin = data.isAdmin
  el('nameInput').value = data.name
  switchTo(1)
})
socket.on('players', list=>{
  const wrap = el('playersList')
  wrap.innerHTML = ''
  const playerButtons = el('playersButtons')
  playerButtons.innerHTML = ''
  list.forEach(p=>{
    const div = document.createElement('div')
    div.className = 'playerItem'
    div.innerHTML = `<div>${p.name}${p.isAdmin? ' • admin':''}</div><div>${p.team?('E'+p.team):'—'}</div>`
    wrap.appendChild(div)
    const btn = document.createElement('button')
    btn.textContent = p.name
    btn.disabled = !(isAdmin)
    btn.onclick = ()=>socket.emit('selectPlayer', p.id)
    playerButtons.appendChild(btn)
  })
})
socket.on('state', s=>{
  el('score1').textContent = s.scores.team1
  el('score2').textContent = s.scores.team2
  document.querySelectorAll('.categories button').forEach(b=>{
    b.classList.toggle('selected', b.dataset.cat === s.selectedCategory)
    b.disabled = !(isAdmin) || s.roundActive
    b.onclick = ()=>socket.emit('selectCategory', b.dataset.cat)
  })
  document.querySelectorAll('.playersButtons button').forEach(b=>b.disabled = !(isAdmin) || s.roundActive)
  el('startRound').disabled = !(isAdmin) || s.roundActive
})
el('startRound').onclick = ()=>socket.emit('startRound')
socket.on('roundStarted', data=>{
  if(myId === data.selectedPlayerId){
    switchTo(3)
    el('controls').style.display = 'flex'
    el('othersNotice').style.display = 'none'
  } else {
    switchTo(3)
    el('controls').style.display = 'none'
    el('othersNotice').style.display = 'block'
  }
})
socket.on('timer', t=>{
  el('timer').textContent = t
})
socket.on('word', w=>{
  if(w === null){
    el('wordArea').textContent = 'Sem mais palavras nesta categoria'
    el('btnAcertou').disabled = true
    el('btnPular').disabled = true
    return
  }
  el('wordArea').textContent = w
  el('btnAcertou').disabled = false
  el('btnPular').disabled = false
})
el('btnAcertou').onclick = ()=>socket.emit('acertou')
el('btnPular').onclick = ()=>socket.emit('pular')
socket.on('puling', ()=>{
  el('wordArea').textContent = 'pulando...'
  el('btnAcertou').disabled = true
  el('btnPular').disabled = true
})
socket.on('scores', s=>{
  el('score1').textContent = s.team1
  el('score2').textContent = s.team2
})
socket.on('updateUsed', arr=>{
})
socket.on('roundEnded', data=>{
  const results = el('results')
  results.innerHTML = ''
  data.summary.forEach(item=>{
    const div = document.createElement('div')
    div.className = 'resultItem ' + (item.status==='skipped'?'red':'green')
    div.innerHTML = `<div class="word">${item.word}</div><div>${item.status==='skipped'?'pulada':'acertada'}</div>`
    results.appendChild(div)
  })
  switchTo(4)
  el('score1').textContent = data.scores.team1
  el('score2').textContent = data.scores.team2
})
socket.on('reset', ()=>{
  alert('Admin reiniciou o jogo. Voltando para tela inicial.')
  location.reload()
})
window.addEventListener('beforeunload', e=>{
  e.preventDefault()
  e.returnValue = ''
})
socket.emit('requestState')
