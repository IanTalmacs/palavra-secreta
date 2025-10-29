const socket = io();
let myId = null;
let amAdmin = false;
let state = null; // latest server state
const app = document.getElementById('app');

function fmtTime(ms){
  const s = Math.ceil(ms/1000);
  const min = Math.floor(s/60);
  const sec = s % 60;
  return min>0 ? `${min}:${sec.toString().padStart(2,'0')}` : `${sec}s`;
}

function render() {
  // main shell
  app.innerHTML = '';
  const shell = document.createElement('div'); shell.className='shell';
  app.appendChild(shell);

  // if no joined yet -> screen 1
  if (!myId) {
    const c = document.createElement('div'); c.className='center';
    const input = document.createElement('input');
    input.placeholder = 'nome';
    input.className = 'input-large';
    input.id = 'nameInput';
    const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent = 'confirmar';
    btn.onclick = () => {
      const name = document.getElementById('nameInput').value || '';
      socket.emit('join', { name });
    };
    c.appendChild(input);
    c.appendChild(btn);
    shell.appendChild(c);
    return;
  }

  // top bar with my name and score summary
  const top = document.createElement('div'); top.style.display = 'flex'; top.style.justifyContent = 'space-between'; top.style.alignItems='center';
  const left = document.createElement('div'); left.innerHTML = `<div class="small">Você: <strong>${getMe().name}</strong> ${amAdmin ? '(Admin)' : ''}</div>`;
  const right = document.createElement('div'); right.innerHTML = `<div class="small">Placar — Equipe1: <strong>${state.scores.team1}</strong> • Equipe2: <strong>${state.scores.team2}</strong></div>`;
  top.appendChild(left); top.appendChild(right);
  shell.appendChild(top);

  // If a round is active -> show round screens
  if (state.round && state.round.active) {
    renderRound(shell);
    return;
  }

  // If server instructed to show prepareTurn (round prepared but not started)
  if (state.round && state.round.category && !state.round.active && state.round.teamTurn) {
    renderPrepare(shell);
    return;
  }

  // Otherwise, show lobby/teams (screen 2) and categories button
  renderLobby(shell);
}

function getMe(){
  return state.players.find(p=>p.id===myId) || {id:myId,name:'Você',team:'lobby',isAdmin:amAdmin};
}

function renderLobby(shell){
  const wrapper = document.createElement('div');
  wrapper.style.display='flex'; wrapper.style.flexDirection='column'; wrapper.style.gap='12px';
  // teams columns
  const teams = document.createElement('div'); teams.className='teams';
  const colLobby = document.createElement('div'); colLobby.className='col'; colLobby.id='col-lobby';
  colLobby.innerHTML = '<h3>Lobby</h3>';
  const col1 = document.createElement('div'); col1.className='col'; col1.id='col-team1'; col1.innerHTML = '<h3>Equipe 1</h3>';
  const col2 = document.createElement('div'); col2.className='col'; col2.id='col-team2'; col2.innerHTML = '<h3>Equipe 2</h3>';

  // populate players
  state.players.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'player' + (p.isAdmin ? ' admin' : '');
    el.draggable = !!amAdmin; // only admin can drag
    el.dataset.id = p.id;
    el.innerHTML = `<div>${escapeHtml(p.name)}</div><div class="small">${p.team}</div>`;
    if (amAdmin) {
      el.addEventListener('dragstart', (ev)=> {
        ev.dataTransfer.setData('text/plain', p.id);
      });
    }
    if (p.team === 'lobby') colLobby.appendChild(el);
    else if (p.team === 'team1') col1.appendChild(el);
    else col2.appendChild(el);
  });

  // allow drop on columns if admin
  if (amAdmin) {
    [colLobby, col1, col2].forEach(col => {
      col.addEventListener('dragover', (ev)=>{ ev.preventDefault(); col.style.opacity=0.8; });
      col.addEventListener('dragleave', ()=>{ col.style.opacity=1; });
      col.addEventListener('drop', (ev)=> {
        ev.preventDefault();
        col.style.opacity=1;
        const playerId = ev.dataTransfer.getData('text/plain');
        let team = 'lobby';
        if (col.id === 'col-team1') team = 'team1';
        if (col.id === 'col-team2') team = 'team2';
        socket.emit('setTeam', { playerId, team });
      });
    });
  }

  teams.appendChild(colLobby); teams.appendChild(col1); teams.appendChild(col2);
  wrapper.appendChild(teams);

  // footer with categories button (admin only)
  const footer = document.createElement('div'); footer.className='footer';
  const small = document.createElement('div'); small.className='small'; small.textContent = 'Arraste jogadores para as equipes (Admin).';
  const catBtn = document.createElement('button'); catBtn.className='btn primary'; catBtn.textContent='Categorias';
  catBtn.onclick = () => socket.emit('startCategories');
  if (!amAdmin) catBtn.disabled = true;
  footer.appendChild(small); footer.appendChild(catBtn);
  wrapper.appendChild(footer);

  shell.appendChild(wrapper);

  // categories list if state.categories present (even when in lobby, admin may have pressed categories)
  if (state.categories && state.categories.length>0 && document.location.hash === '#categories') {
    renderCategories(shell);
  }
}

// show categories grid (screen 3)
function renderCategories(shell){
  const container = document.createElement('div'); container.style.marginTop='12px';
  container.innerHTML = '<h3>Escolha uma categoria</h3>';
  const grid = document.createElement('div'); grid.className='grid';
  state.categories.forEach(cat=>{
    const card = document.createElement('div'); card.className='card';
    card.textContent = cat;
    card.onclick = () => {
      if (!amAdmin) return;
      socket.emit('selectCategory', { category: cat });
      // move to prepare screen (server will emit)
    };
    grid.appendChild(card);
  });
  container.appendChild(grid);
  shell.appendChild(container);
}

// prepare screen (screen 4)
function renderPrepare(shell) {
  const box = document.createElement('div'); box.className='center';
  const teamTurn = state.round.teamTurn === 'team1' ? 'Equipe 1' : 'Equipe 2';
  const name = state.round.chosenPlayerId ? (state.players.find(p=>p.id===state.round.chosenPlayerId)?.name || '') : '(sem jogador)';
  const p = document.createElement('div'); p.className='small'; p.textContent = `${teamTurn} — preparar ${name}`;
  const startBtn = document.createElement('button'); startBtn.className='btn primary'; startBtn.textContent='iniciar';
  // start button should appear only for the chosen player
  startBtn.style.display = (myId === state.round.chosenPlayerId) ? 'inline-block' : 'none';
  startBtn.onclick = () => {
    socket.emit('playerStartTurn');
  };
  box.appendChild(p); box.appendChild(startBtn);
  shell.appendChild(box);
}

// render round (either 5(a) or 5(b))
let localSkipUntil = 0;
function renderRound(shell) {
  const box = document.createElement('div'); box.style.display='flex'; box.style.flexDirection='column'; box.style.alignItems='center';
  const timerEl = document.createElement('div'); timerEl.className='timer'; timerEl.id='timerEl'; timerEl.textContent='--';
  box.appendChild(timerEl);

  const isChosen = myId === state.round.chosenPlayerId;
  if (isChosen) {
    // show word and buttons
    const wordEl = document.createElement('div'); wordEl.className='word'; wordEl.id='wordEl';
    wordEl.textContent = state.round.currentWord || '...';
    const buttons = document.createElement('div'); buttons.className='big-buttons'; buttons.id='buttons';
    const correct = document.createElement('button'); correct.className='circle-btn green'; correct.textContent='acertou';
    const skip = document.createElement('button'); skip.className='circle-btn red'; skip.textContent='pular';
    correct.onclick = () => socket.emit('correct');
    skip.onclick = () => {
      socket.emit('skip');
    };
    buttons.appendChild(correct); buttons.appendChild(skip);
    box.appendChild(wordEl); box.appendChild(buttons);

    // during skip, the server will send skipAck with an until timestamp
    if (Date.now() < localSkipUntil) {
      // hide buttons/word and show pulando...
      wordEl.style.display='none';
      buttons.style.display='none';
      const overlay = document.createElement('div'); overlay.className='center-overlay'; overlay.textContent='pulando...';
      overlay.id='skipOverlay';
      box.appendChild(overlay);
    }
  } else {
    // not chosen: show only timer
    const info = document.createElement('div'); info.className='small'; info.textContent='Aguarde...';
    box.appendChild(info);
  }

  shell.appendChild(box);

  // results area (live): show wordsLog
  if (state.round.wordsLog && state.round.wordsLog.length>0) {
    const res = document.createElement('div'); res.className='results';
    state.round.wordsLog.forEach(w=>{
      const it = document.createElement('div'); it.className='result-item ' + (w.status==='correct' ? 'correct' : 'skipped');
      it.innerHTML = `<div>${w.word}</div><div class="small">${w.status}</div>`;
      res.appendChild(it);
    });
    shell.appendChild(res);
  }
}

// handle roundEnded screen (screen 6) when server emits roundEnded
function renderRoundEnded(wordsLog) {
  app.innerHTML = '';
  const shell = document.createElement('div'); shell.className='shell';
  app.appendChild(shell);
  const top = document.createElement('div'); top.className='center';
  top.innerHTML = `<div class="small">Resultado</div>`;
  shell.appendChild(top);
  const list = document.createElement('div'); list.className='results';
  wordsLog.forEach(w => {
    const it = document.createElement('div'); it.className='result-item ' + (w.status==='correct' ? 'correct' : 'skipped');
    it.innerHTML = `<div>${w.word}</div><div class="small">${w.status}</div>`;
    list.appendChild(it);
  });
  shell.appendChild(list);

  const footer = document.createElement('div'); footer.className='footer';
  const empty = document.createElement('div'); empty.className='small'; empty.textContent='Aguardando avanço (Admin)';
  const adv = document.createElement('button'); adv.className='btn primary'; adv.textContent='avançar';
  adv.onclick = () => socket.emit('adminAdvance');
  if (!amAdmin) adv.disabled = true;
  footer.appendChild(empty); footer.appendChild(adv);
  shell.appendChild(footer);
}

// helper escape
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// socket handlers
socket.on('joined', (d) => {
  // server acknowledged join
  myId = d.id;
  amAdmin = !!d.isAdmin;
  // show categories when admin clicked; server will emit goCategories
  // render initial
  render();
  // add beforeunload warning
  window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
  });
});

socket.on('state', (s) => {
  state = s;
  // ensure we have players normalized
  // state.players is array
  render();
});

socket.on('goCategories', () => {
  // show categories UI: we'll use location hash to show them
  document.location.hash = '#categories';
  render();
});

socket.on('prepareTurn', (d) => {
  // show prepare screen
  document.location.hash = '#prepare';
  // update local state: server will also emit state update
  render();
});

socket.on('startRound', (d) => {
  // d: {endTime, currentWord, chosenPlayerId, teamTurn...}
  document.location.hash = '#round';
  render();
});

socket.on('time', (d) => {
  const tEl = document.getElementById('timerEl');
  if (tEl) tEl.textContent = fmtTime(d.timeLeftMs);
  // hide skip button when <=5s by disabling via DOM
  if (d.timeLeftMs <= 5000) {
    const skipBtn = document.querySelector('.circle-btn.red');
    if (skipBtn) skipBtn.style.display = 'none';
  }
});

socket.on('correctAck', (d) => {
  // update UI: new word and scores
  // server also emits state so we'll re-render
  render();
});

socket.on('skipAck', (d) => {
  // show pulando... overlay locally until d.until
  localSkipUntil = d.until;
  render();
});

socket.on('newWord', (d) => {
  render();
});

socket.on('roundEnded', (d) => {
  renderRoundEnded(d.wordsLog);
});

socket.on('backToCategories', () => {
  document.location.hash = '#categories';
  render();
});

socket.on('forceReset', () => {
  // admin left: send client back to join screen
  myId = null;
  amAdmin = false;
  state = null;
  document.location.hash = '';
  render();
});

// utility: keep local players array for easy lookup
Object.defineProperty(window, 'state', {
  get() { return state; }
});

// initial render
render();
