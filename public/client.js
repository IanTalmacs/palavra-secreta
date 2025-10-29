const socket = io();

let myId = null;
let playerToPlayId = null;
let localState = null;

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return document.querySelectorAll(sel); }

function render(state){
  localState = state;
  myId = socket.id;
  showScreen(state.screen);
  renderPlayers(state);
  renderScores(state);
  renderCategories(state);
  renderAnswered(state);
  if(state.round && state.round.endTime){
  }
}

socket.on('connect', ()=> {
  socket.emit('join');
});

socket.on('state', s => {
  render(s);
});

socket.on('playerToPlay', id => {
  playerToPlayId = id;
  if(socket.id === id){
    showStartForMe(true);
  } else {
    showStartForMe(false);
  }
});

socket.on('startTurn', ({playerId, endTime, word})=>{
  showScreen(4);
  if(socket.id === playerId){
    showWord(word);
    enableControls(true);
  } else {
    showWord('');
    enableControls(false);
  }
  startLocalTimer(endTime);
});

socket.on('roundUpdate', ({currentWord, skipping, answered})=>{
  if(skipping){
    showWord('pulando...');
    enableControls(false);
  } else {
    showWord(currentWord || '');
    if(socket.id === (localState && localState.round && localState.round.playerId)) enableControls(true);
  }
  updateAnsweredList(answered);
});

socket.on('tick', ({remaining})=>{
  updateTimer(Math.ceil(remaining/1000));
});

socket.on('timeUp', ({answered, scores})=>{
  updateAnsweredList(answered);
  renderScores({scores});
  showScreen(5);
});

document.getElementById('confirmBtn').addEventListener('click', ()=>{
  const name = document.getElementById('nameInput').value.trim();
  if(!name) return;
  socket.emit('confirmName', name);
  document.getElementById('nameInput').value = '';
  document.getElementById('nameInput').style.display = 'none';
  document.getElementById('confirmBtn').style.display = 'none';
});

function renderPlayers(state){
  ['lobby','team1','team2'].forEach(k=>{
    const ul = document.getElementById(k);
    if(!ul) return;
    ul.innerHTML = '';
    (state.teams[k] || []).forEach(id=>{
      const p = state.players[id];
      if(!p) return;
      const li = document.createElement('li');
      li.className = 'player';
      const isAdmin = state.players[socket.id] && state.players[socket.id].isAdmin;
      li.setAttribute('draggable', !!isAdmin);
      li.id = 'player-'+id;
      li.textContent = p.displayName || p.name;

      if(isAdmin){
        li.addEventListener('dragstart', e=>{
          e.dataTransfer.setData('text/plain', id);
        });
        li.addEventListener('click', (ev)=>{
          // on screen 1 allow quick move by admin (mobile-friendly)
          if(state.screen === 1){
            const dest = prompt('Mover para: "lobby", "team1" ou "team2"', 'team1');
            if(!dest) return;
            const d = dest.trim();
            if(['lobby','team1','team2'].includes(d)){
              socket.emit('dragUpdate', { playerId: id, toTeam: d });
            }
          }
        });
      }

      ul.appendChild(li);
    });
  });

  const tp = document.getElementById('teamsPlayers');
  if(tp){
    tp.innerHTML = '';
    ['team1','team2'].forEach(t=>{
      const div = document.createElement('div');
      div.className = 'team-block';
      const title = document.createElement('div');
      title.textContent = t === 'team1' ? 'Equipe 1' : 'Equipe 2';
      div.appendChild(title);
      const ul = document.createElement('ul');
      ul.className = 'droplist';
      (state.teams[t] || []).forEach(id=>{
        const li = document.createElement('li');
        li.className = 'player';
        li.textContent = state.players[id].displayName || state.players[id].name;
        li.addEventListener('click', ()=>{
          if(state.players[socket.id] && state.players[socket.id].isAdmin && state.screen === 3){
            socket.emit('selectPlayerToPlay', id);
          }
        });
        ul.appendChild(li);
      });
      div.appendChild(ul);
      tp.appendChild(div);
    });
  }

  setupDropTargets();
}

function renderScores(state){
  const s = state.scores || (state.scores = {team1:0,team2:0});
  const sb = document.getElementById('scoreboard');
  const sb3 = document.getElementById('scoreboard3');
  const sb4 = document.getElementById('scoreboard4');
  const sb5 = document.getElementById('scoreboard5');
  const html = `<div>Equipe 1: ${s.team1 || 0}</div><div>Equipe 2: ${s.team2 || 0}</div>`;
  if(sb) sb.innerHTML = html;
  if(sb3) sb3.innerHTML = html;
  if(sb4) sb4.innerHTML = html;
  if(sb5) sb5.innerHTML = html;
}

function renderCategories(state){
  const wrap = document.getElementById('categories');
  if(!wrap) return;
  wrap.innerHTML = '';
  (state.categories || []).forEach(c=>{
    const b = document.createElement('div');
    b.className = 'category';
    b.textContent = c;
    b.addEventListener('click', ()=>{
      socket.emit('selectCategory', c);
    });
    wrap.appendChild(b);
  });
}

document.getElementById('categoriesBtn').addEventListener('click', ()=>{
  socket.emit('advanceScreen');
});
document.getElementById('categoriesAdvance').addEventListener('click', ()=>{
  socket.emit('advanceScreen');
});
document.getElementById('categoriesBtn2').addEventListener('click', ()=>{
  socket.emit('advanceScreen');
});

function showScreen(n){
  [1,2,3,4,5].forEach(i=>{
    const el = document.getElementById('screen-'+i);
    if(!el) return;
    el.hidden = (i !== n);
  });
}

function showStartForMe(show){
  const controls = document.getElementById('controls');
  let btn = document.getElementById('startBtn');
  if(show){
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'startBtn';
      btn.textContent = 'iniciar';
      btn.className = 'circle green';
      btn.addEventListener('click', ()=> socket.emit('startTurn'));
      controls.appendChild(btn);
    }
  } else {
    if(btn) btn.remove();
  }
}

function showWord(text){
  const wa = document.getElementById('wordArea');
  wa.textContent = text || '';
}

function enableControls(enable){
  const controls = document.getElementById('controls');
  controls.innerHTML = '';
  if(enable){
    const ac = document.createElement('button');
    ac.className = 'circle green';
    ac.textContent = 'acertou';
    ac.addEventListener('click', ()=> socket.emit('correct'));
    const sk = document.createElement('button');
    sk.className = 'circle red';
    sk.id = 'skipBtn';
    sk.textContent = 'pular';
    sk.addEventListener('click', ()=> socket.emit('skip'));
    controls.appendChild(ac);
    controls.appendChild(sk);
  }
}

let timerInterval = null;
function startLocalTimer(endTime){
  if(timerInterval) clearInterval(timerInterval);
  function tick(){
    const now = Date.now();
    const sec = Math.max(0, Math.ceil((endTime - now)/1000));
    updateTimer(sec);
    if(sec <= 0){
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const sk = document.getElementById('skipBtn');
    if(sk){
      if(sec <= 5) sk.style.display = 'none'; else sk.style.display = '';
    }
  }
  tick();
  timerInterval = setInterval(tick, 250);
}

function updateTimer(sec){
  const t = document.getElementById('timerBig');
  if(t) t.textContent = sec.toString();
}

function updateAnsweredList(list){
  const wrapper = document.getElementById('answeredList');
  if(!wrapper) return;
  wrapper.innerHTML = '';
  (list || []).forEach(it=>{
    const div = document.createElement('div');
    div.className = 'answered-item ' + (it.result === 'correct' ? 'correct' : 'skipped');
    div.textContent = it.word;
    wrapper.appendChild(div);
  });
}

function renderAnswered(state){
  if(state.usedWords && state.usedWords.length){
    updateAnsweredList([]);
  }
}

function setupDropTargets(){
  ['lobby','team1','team2'].forEach(k=>{
    const ul = document.getElementById(k);
    if(!ul) return;
    ul.ondragover = (e)=> { e.preventDefault(); };
    ul.ondrop = (e)=> {
      e.preventDefault();
      const pid = e.dataTransfer.getData('text/plain');
      if(!pid) return;
      socket.emit('dragUpdate', { playerId: pid, toTeam: k });
    };
  });
}

window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('DOMContentLoaded', ()=>{
  showScreen(1);
});
