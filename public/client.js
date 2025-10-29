const socket = io();
let name = "";
let myId = null;
let admin = null;
let screen = 1;
let selectedPlayer = null;
let timeLeft = 0;
let scores = {1:0,2:0};
let currentWord = "";
let results = [];

window.onbeforeunload = () => "Sair irá reiniciar o jogo.";

const app = document.getElementById('app');

function render(state) {
  app.innerHTML = "";
  admin = state.admin;
  screen = state.screen;
  scores = state.scores || {1:0,2:0};
  if (screen === 1) renderScreen1(state);
  else if (screen === 2) renderScreen2();
  else if (screen === 3) renderScreen3(state);
  else if (screen === 4) renderScreen4(state);
  else if (screen === 5) renderScreen5(state);
}

function renderScreen1(state){
  const input = document.createElement('input');
  input.placeholder = "Digite seu nome";
  const btn = document.createElement('button');
  btn.textContent = "Entrar";
  btn.onclick = () => {
    name = input.value.trim();
    if(name){
      socket.emit('join', name);
      myId = socket.id;
    }
  };
  app.append(input, btn);
  if(Object.keys(state.players).length>0){
    const t1 = document.createElement('div');
    const t2 = document.createElement('div');
    t1.innerHTML = "<h2>Equipe 1</h2>";
    t2.innerHTML = "<h2>Equipe 2</h2>";
    state.teams[1].forEach(p=>{t1.innerHTML+=`<div>${state.players[p].name}</div>`});
    state.teams[2].forEach(p=>{t2.innerHTML+=`<div>${state.players[p].name}</div>`});
    t1.onclick = ()=>socket.emit('joinTeam',1);
    t2.onclick = ()=>socket.emit('joinTeam',2);
    app.append(t1,t2);
  }
  if(socket.id===admin){
    const cat = document.createElement('button');
    cat.textContent = "Categorias";
    cat.onclick = ()=>socket.emit('showCategories');
    app.append(cat);
  }
}

function renderScreen2(){
  const score = document.createElement('h2');
  score.textContent = `Equipe 1: ${scores[1]} | Equipe 2: ${scores[2]}`;
  app.append(score);
  const cats = ["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissões","alimentos","personagens","bíblico"];
  cats.forEach(c=>{
    const b=document.createElement('div');
    b.className="category";
    b.textContent=c;
    if(socket.id===admin) b.onclick=()=>socket.emit('selectCategory',c);
    app.append(b);
  });
}

function renderScreen3(state){
  for(let id in state.players){
    const b=document.createElement('button');
    b.textContent=state.players[id].name;
    if(socket.id===admin) b.onclick=()=>socket.emit('choosePlayer',id);
    app.append(b);
  }
}

function renderScreen4(state){
  const t=document.createElement('div');
  t.textContent=`Tempo: ${timeLeft}s`;
  t.id="timer";
  app.append(t);
  if(socket.id===selectedPlayer){
    const w=document.createElement('div');
    w.className='word';
    w.textContent=currentWord;
    app.append(w);
    const ok=document.createElement('button');
    ok.textContent='Acertou';
    ok.onclick=()=>socket.emit('correct');
    const skip=document.createElement('button');
    skip.textContent='Pular';
    skip.className='red';
    skip.onclick=()=>socket.emit('skip');
    app.append(ok,skip);
  }
}

function renderScreen5(state){
  state.results.forEach(r=>{
    const d=document.createElement('div');
    d.textContent=r.word;
    d.className=r.correct?'green':'red';
    app.append(d);
  });
  const b=document.createElement('button');
  b.textContent='Categorias';
  b.onclick=()=>socket.emit('backToCategories');
  app.append(b);
}

socket.on('state', render);
socket.on('playerChosen', pid=>{
  selectedPlayer=pid;
  if(socket.id===pid){
    const start=document.createElement('button');
    start.textContent="Iniciar";
    start.onclick=()=>socket.emit('startRound');
    app.innerHTML='';
    app.append(start);
  }
});
socket.on('roundStart', data=>{
  currentWord=data.currentWord;
  timeLeft=data.timeLeft;
  render({screen:4});
});
socket.on('newWord', data=>{
  currentWord=data.currentWord;
  scores=data.scores;
  render({screen:4});
});
socket.on('skipping', ()=>{
  app.innerHTML='<h1>Pulando...</h1>';
});
socket.on('timer', t=>{
  timeLeft=t;
  const el=document.getElementById('timer');
  if(el) el.textContent=`Tempo: ${timeLeft}s`;
});
socket.on('showResults', data=>{
  render(data);
});
socket.on('reset', ()=>location.reload());
