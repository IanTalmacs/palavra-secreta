const socket = io();
let mySocketId = null;
let myName = null;
let state = {};

// initial
const container = document.getElementById('screen-container');
const score1 = document.getElementById('score1');
const score2 = document.getElementById('score2');

window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

socket.on('connect', () => { mySocketId = socket.id; renderLogin(); });
socket.on('state', (s) => { state = s; renderByState(); });
socket.on('reset', () => { // forced back to login
  state = {};
  renderLogin();
});

socket.on('timerStart', ({ duration, activePlayer }) => {
  // show timer
  state.timer = { remaining: duration, activePlayer };
  renderByState();
});
socket.on('timerTick', ({ remaining }) => {
  if (state.timer) state.timer.remaining = remaining;
  renderByState();
});
socket.on('timerEnd', ({ result }) => {
  state.lastRoundResult = result;
  renderByState();
});

socket.on('wordCorrect', ({ word, scores }) => {
  state.scores = scores;
  // server already updated usedWords; clients will show via timer
  renderByState();
});
socket.on('wordSkipped', ({ word }) => { renderByState(); });

// UI render functions
function renderLogin(){
  container.innerHTML = '';
  const scr = document.createElement('div'); scr.className='screen center';
  const input = document.createElement('input'); input.type='text'; input.placeholder='Seu nome'; input.id='nameInput'; input.style.width='100%';
  const btn = document.createElement('button'); btn.className='btn primary'; btn.textContent='confirmar';
  btn.onclick = () => {
    const name = input.value.trim(); if(!name) return alert('digite um nome');
    myName = name;
    socket.emit('join', name);
  };
  scr.appendChild(input); scr.appendChild(document.createElement('br')); scr.appendChild(document.createElement('br'));
  scr.appendChild(btn);
  container.appendChild(scr);
}

function renderByState(){
  // if no state means show login
  if (!state || Object.keys(state).length === 0) return renderLogin();
  // determine screen by round
  const phase = state.round && state.round.currentCategory ? (state.round.phase || 'category') : 'lobby';
  // update score bar
  score1.textContent = state.scores ? state.scores.team1 : 0;
  score2.textContent = state.scores ? state.scores.team2 : 0;

  if (!state.round.currentCategory && phase==='lobby') {
    renderLobby();
    return;
  }
  // if in categories list
  if (state.round.currentCategory === null && state.round.phase === 'category') {
    renderCategories();
    return;
  }
  // if picking/playing/review
  if (state.round.currentCategory && (state.round.phase === 'picking' || state.round.phase === 'playing' || state.round.phase === 'review')) {
    renderTurn();
    return;
  }
  // fallback
  container.innerHTML = '<div class="screen center"><div>aguardando</div></div>';
}

function renderLobby(){
  container.innerHTML='';
  const scr = document.createElement('div'); scr.className='screen';
  const teamsWrap = document.createElement('div'); teamsWrap.className='teams';

  const lobbyCol = document.createElement('div'); lobbyCol.className='team-column';
  const lobbyTitle = document.createElement('div'); lobbyTitle.textContent='Lobby'; lobbyTitle.className='small';
  lobbyCol.appendChild(lobbyTitle);
  const lobbyList = document.createElement('div'); lobbyList.id='lobbyList';

  (state.lobbyOrder||[]).forEach(sid=>{
    const p = state.players[sid];
    if (!p) return;
    const el = document.createElement('div'); el.className='list-item'; el.draggable = true; el.dataset.sid = sid; el.textContent = p.displayName;
    el.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/plain', sid); });
    lobbyList.appendChild(el);
  });
  lobbyCol.appendChild(lobbyList);

  const team1Col = document.createElement('div'); team1Col.className='team-column';
  const t1t = document.createElement('div'); t1t.textContent='Equipe 1'; t1t.className='small'; team1Col.appendChild(t1t);
  const team1List = document.createElement('div'); team1List.id='team1List';
  (state.teams.team1||[]).forEach(sid=>{ const p=state.players[sid]; if(!p) return; const el = document.createElement('div'); el.className='list-item'; el.dataset.sid=sid; el.textContent=p.displayName; el.draggable=true; el.addEventListener('dragstart', (e)=>e.dataTransfer.setData('text/plain', sid)); team1List.appendChild(el); });
  team1Col.appendChild(team1List);

  const team2Col = document.createElement('div'); team2Col.className='team-column';
  const t2t = document.createElement('div'); t2t.textContent='Equipe 2'; t2t.className='small'; team2Col.appendChild(t2t);
  const team2List = document.createElement('div'); team2List.id='team2List';
  (state.teams.team2||[]).forEach(sid=>{ const p=state.players[sid]; if(!p) return; const el=document.createElement('div'); el.className='list-item'; el.dataset.sid=sid; el.textContent=p.displayName; el.draggable=true; el.addEventListener('dragstart',(e)=>e.dataTransfer.setData('text/plain', sid)); team2List.appendChild(el); });
  team2Col.appendChild(team2List);

  teamsWrap.appendChild(lobbyCol); teamsWrap.appendChild(team1Col); teamsWrap.appendChild(team2Col);
  scr.appendChild(teamsWrap);

  // drag targets (admin only)
  if (mySocketId === state.adminSocketId) {
    [lobbyList, team1List, team2List].forEach(el=>{
      el.addEventListener('dragover', (e)=>{ e.preventDefault(); });
      el.addEventListener('drop', (e)=>{
        e.preventDefault();
        const sid = e.dataTransfer.getData('text/plain');
        // move element client side
        const lists = { lobby: Array.from(lobbyList.children).map(n=>n.dataset.sid), team1: Array.from(team1List.children).map(n=>n.dataset.sid), team2: Array.from(team2List.children).map(n=>n.dataset.sid) };
        // remove sid from all
        ['lobby','team1','team2'].forEach(k=>{ lists[k] = lists[k].filter(s=>s!==sid); });
        // add to target
        if (el===lobbyList) lists.lobby.push(sid);
        else if (el===team1List) lists.team1.push(sid);
        else lists.team2.push(sid);
        socket.emit('updateTeams', { team1: lists.team1, team2: lists.team2, lobby: lists.lobby });
      });
    });

    const categoriesBtn = document.createElement('button'); categoriesBtn.className='btn primary'; categoriesBtn.textContent='Categorias';
    categoriesBtn.onclick = () => {
      // advance to categories screen (admin)
      socket.emit('startCategoryPhase', null);
    };
    scr.appendChild(document.createElement('br'));
    scr.appendChild(categoriesBtn);
  }

  container.appendChild(scr);
}

function renderCategories(){
  container.innerHTML='';
  const scr = document.createElement('div'); scr.className='screen center';
  const row = document.createElement('div'); row.className='section-row';
  (state.categories||[]).forEach(c=>{
    const b = document.createElement('button'); b.className='category'; b.textContent = c.label; b.onclick = () => { if (mySocketId !== state.adminSocketId) return; socket.emit('startCategoryPhase', c.key); socket.emit('adminAdvanceFromCategories'); };
    row.appendChild(b);
  });
  scr.appendChild(row);
  scr.appendChild(document.createElement('br'));
  const finish = document.createElement('button'); finish.className='btn purple'; finish.textContent='finalizar';
  finish.onclick = () => { if (mySocketId !== state.adminSocketId) return; // confirm
    const confirmBox = document.createElement('div'); confirmBox.className='confirm'; const yes = document.createElement('button'); yes.className='btn primary'; yes.textContent='sim'; const no = document.createElement('button'); no.className='btn ghost'; no.textContent='não'; yes.onclick = () => socket.emit('endGameConfirm', true); no.onclick = () => socket.emit('endGameConfirm', false);
    scr.appendChild(confirmBox); confirmBox.appendChild(yes); confirmBox.appendChild(no);
  };
  scr.appendChild(finish);
  container.appendChild(scr);
}

function renderTurn(){
  container.innerHTML='';
  const scr = document.createElement('div'); scr.className='screen center';
  const cat = state.round.currentCategory;
  const team = state.round.turnTeam;
  const active = state.round.activePlayerSocket;
  const isActivePlayer = active === mySocketId;

  const prep = document.createElement('div'); prep.className='small'; prep.textContent = `preparar ${state.players && state.players[active] ? state.players[active].displayName : ''}`;
  scr.appendChild(prep);

  // show start button only to chosen player when phase == picking
  if (state.round.phase === 'picking' && isActivePlayer) {
    const startBtn = document.createElement('button'); startBtn.className='btn primary'; startBtn.textContent='iniciar'; startBtn.onclick = () => socket.emit('startTurn');
    scr.appendChild(startBtn);
  }

  // if playing: show time and word & controls for active player; others show only time
  if (state.round.phase === 'playing' || (state.timer && state.timer.activePlayer)) {
    const remaining = state.timer ? state.timer.remaining : 0;
    const timerDiv = document.createElement('div'); timerDiv.className='timer'; timerDiv.textContent = `${remaining}s`;
    scr.appendChild(timerDiv);

    if (isActivePlayer) {
      const wordDiv = document.createElement('div'); wordDiv.className='big-word'; wordDiv.id='wordHere'; wordDiv.textContent = '—';
      scr.appendChild(wordDiv);
      const controls = document.createElement('div'); controls.className='controls';
      const correct = document.createElement('button'); correct.className='circle-btn green'; correct.textContent='acertou';
      correct.onclick = () => socket.emit('correct');
      const skip = document.createElement('button'); skip.className='circle-btn red'; skip.textContent='pular'; skip.id='skipBtn';
      skip.onclick = () => {
        skip.disabled = true; socket.emit('skip'); setTimeout(()=>skip.disabled=false, 3000);
      };
      controls.appendChild(correct); controls.appendChild(skip);
      scr.appendChild(controls);
      // hide skip when <=5s
      if (state.timer && state.timer.remaining <= 5) skip.style.display='none'; else skip.style.display='inline-flex';
    } else {
      // spectator view
      const onlyTimer = document.createElement('div'); onlyTimer.className='big-word'; onlyTimer.textContent='Aguardando...'; scr.appendChild(onlyTimer);
    }
  }

  // review phase
  if (state.round.phase === 'review' || state.lastRoundResult) {
    const listOk = document.createElement('div'); listOk.className='small'; listOk.textContent='Palavras acertadas:';
    scr.appendChild(listOk);
    const ulOk = document.createElement('div'); ulOk.style.width='100%'; ulOk.style.textAlign='center';
    (state.lastRoundResult && state.lastRoundResult.correct || []).forEach(w=>{ const d=document.createElement('div'); d.textContent=w; d.style.color='lightgreen'; ulOk.appendChild(d); });
    scr.appendChild(ulOk);
    const listSk = document.createElement('div'); listSk.className='small'; listSk.textContent='Palavras puladas:'; scr.appendChild(listSk);
    const ulSk = document.createElement('div'); ulSk.style.width='100%'; ulSk.style.textAlign='center';
    (state.lastRoundResult && state.lastRoundResult.skipped || []).forEach(w=>{ const d=document.createElement('div'); d.textContent=w; d.style.color='tomato'; ulSk.appendChild(d); });
    scr.appendChild(ulSk);

    if (mySocketId === state.adminSocketId) {
      const adv = document.createElement('button'); adv.className='btn primary'; adv.textContent='avançar'; adv.onclick = ()=> socket.emit('finishTurn');
      scr.appendChild(document.createElement('br'));
      scr.appendChild(adv);
    }
  }

  container.appendChild(scr);
}

// request initial state periodically if disconnected
setInterval(()=>{ if (socket.connected) socket.emit('requestState'); }, 3000);