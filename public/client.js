// client.js
const socket = io();
let mySocketId = null;
let localState = {}; // server-sent sanitized state
let myNameRaw = '';
let myIsAdmin = false;
let currentScreen = 1;
const app = document.getElementById('app');

// Before unload warning
window.addEventListener('beforeunload', (e)=>{
  e.preventDefault();
  e.returnValue = '';
  // modern browsers show default message
});

// initial welcome
socket.on('welcome', (d) => {
  mySocketId = d.socketId;
});

// state updates
socket.on('state', (s) => {
  localState = s;
  currentScreen = s.screen;
  render();
});

// if server forces reset (admin left)
socket.on('resetToScreen1', ()=>{
  alert('Admin desconectou — jogo reiniciado.');
  // we will receive state update immediately after
});

// messages
socket.on('msg', m => {
  alert(m);
});

// round events
socket.on('roundStarted', (d) => {
  // if I'm the selected player -> show word and buttons; others show only timer
  render();
});

socket.on('tick', ({timeLeft})=>{
  // update timer on UI
  const t = document.querySelector('.timer');
  if (t) t.textContent = formatTime(timeLeft);
});

socket.on('hideSkip', ()=>{
  const skipBtn = document.querySelector('.circle-btn.red');
  if (skipBtn) skipBtn.style.display = 'none';
});

socket.on('wordGuessed', ({word, nextWord, teamScores})=>{
  // update UI: if selected player -> show nextWord
  if (mySocketId === localState.selectedPlayerId && currentScreen === 5){
    const wEl = document.querySelector('.word');
    if (wEl) wEl.textContent = nextWord || '';
  }
  render(); // to update scores
});

socket.on('wordSkipped', ({word})=>{
  // hide word/buttons for 3s — we'll show a "Pulando..." message
  render();
});

socket.on('skipEnded', ({nextWord})=>{
  if (mySocketId === localState.selectedPlayerId && currentScreen === 5){
    const wEl = document.querySelector('.word');
    if (wEl) wEl.textContent = nextWord || '';
  }
  render();
});

socket.on('roundEnded', (d)=>{
  // server also sets screen to 6 and sends global state; just render
  render();
});

// helper format
function formatTime(s){
  const mm = Math.floor(s/60);
  const ss = s%60;
  return `${mm}:${ss.toString().padStart(2,'0')}`;
}

// render
function render(){
  app.innerHTML = '';
  const screen = currentScreen || 1;
  // create base card
  const card = document.createElement('div');
  card.className = 'screen';
  app.appendChild(card);

  if (screen === 1){
    renderScreen1(card);
  } else if (screen === 2){
    renderScreen2(card);
  } else if (screen === 3){
    renderScreen3(card);
  } else if (screen === 4){
    renderScreen4(card);
  } else if (screen === 5){
    renderScreen5(card);
  } else if (screen === 6){
    renderScreen6(card);
  } else {
    card.innerHTML = '<div>Estado desconhecido</div>';
  }
}

/* ---------- SCREEN 1 ----------
campo nome + confirmar.
Confirm só funciona se houver exatamente 1 admin (servidor controla).
*/
function renderScreen1(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Digite seu nome</div>
  <div class="small">Admins: ${localState.adminCount || 0}</div>`;
  container.appendChild(header);

  const input = document.createElement('input');
  input.className = 'input';
  input.placeholder = 'Seu nome (se incluir 999 você será Admin, mas 999 não aparecerá)';
  input.value = myNameRaw ? myNameRaw.replace(/999/g,'') : '';
  input.addEventListener('input', (e)=> {
    // keep local raw separately; when user presses confirm we'll include 999 if they typed it originally — but UX: let user type 999; we must send exact raw
    myNameRaw = e.target.value;
  });
  container.appendChild(input);

  // helpful toggle to add 999 quickly (invisible)
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';
  controls.style.marginTop = '8px';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn';
  confirmBtn.textContent = 'Confirmar';
  confirmBtn.onclick = () => {
    // send join
    // if user typed "nome" and wants to be admin they must include 999 in name; we will actually treat myNameRaw as raw - but we want 999 to be invisible so we send nameRaw with 999
    // let's ask the user: if they want admin, they should append 999 in the input. To keep it simple: if they typed "admin" and want to be admin they must include 999 explicitly.
    const raw = myNameRaw;
    if (!raw || raw.trim().length === 0){
      alert('Digite um nome.');
      return;
    }
    // send raw to server
    socket.emit('joinWithName', raw);
    // After joining, try to confirm to move to screen 2 (only works if exactly 1 admin)
    socket.emit('confirm');
  };
  controls.appendChild(confirmBtn);

  const hint = document.createElement('div');
  hint.className = 'small-note';
  hint.style.marginTop = '8px';
  hint.textContent = 'OBS: Para virar admin, inclua "999" no seu nome (os caracteres "999" não aparecerão no nome exibido). O botão Confirmar só funciona se houver exatamente 1 admin conectado.';
  container.appendChild(controls);
  container.appendChild(hint);
}

/* ---------- SCREEN 2 ----------
Lobby + Team1 + Team2. Admin pode arrastar players para equipes.
Botão 'categorias' (admin só) avança para screen3.
*/
function renderScreen2(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Organize as equipes</div>
  <div class="small">Admins: ${localState.adminCount || 0}</div>`;
  container.appendChild(header);

  const teamsWrap = document.createElement('div');
  teamsWrap.className = 'teams';

  const teamPanels = getTeamsPanels();
  teamPanels.forEach(p => teamsWrap.appendChild(p));
  container.appendChild(teamsWrap);

  // categories button (admin-only)
  const footer = document.createElement('div');
  footer.className = 'footer';
  const catBtn = document.createElement('button');
  catBtn.className = 'btn';
  catBtn.textContent = 'Categorias';
  catBtn.onclick = ()=>{
    socket.emit('openCategories');
  };
  // disable if not admin
  // enable only for admin sockets (but exception: only admin can click)
  if (!isMeAdmin()) catBtn.disabled = true;
  footer.appendChild(catBtn);
  container.appendChild(footer);
}

function getTeamsPanels(){
  const wrap = [];

  const teams = getPlayerListByTeamFromLocal();
  ['lobby','team1','team2'].forEach(teamKey=>{
    const card = document.createElement('div');
    card.className = 'team-card panel';
    card.style.minWidth = '0';
    card.dataset.team = teamKey;
    const title = teamKey === 'lobby' ? 'Lobby' : (teamKey === 'team1' ? 'Equipe 1' : 'Equipe 2');
    card.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${title}</div>`;
    const list = document.createElement('div');
    list.style.minHeight = '60px';
    teams[teamKey].forEach(p=>{
      const it = document.createElement('div');
      it.className = 'player-item' + (p.isAdmin ? ' admin' : '');
      it.draggable = isMeAdmin(); // only admin can drag
      it.dataset.playerId = p.id;
      it.innerHTML = `<div>${p.name}${p.isAdmin ? ' • Admin' : ''}</div>`;
      // drag handlers (admin only)
      if (isMeAdmin()){
        it.addEventListener('dragstart', (ev)=>{
          ev.dataTransfer.setData('text/plain', p.id);
        });
      }
      list.appendChild(it);
    });
    // drop listeners on team panels (admin only)
    if (isMeAdmin()){
      card.addEventListener('dragover', (ev)=>{ ev.preventDefault(); });
      card.addEventListener('drop', (ev)=>{
        ev.preventDefault();
        const pid = ev.dataTransfer.getData('text/plain');
        const toTeam = card.dataset.team;
        socket.emit('movePlayer', { playerId: pid, toTeam });
      });
    }
    card.appendChild(list);
    wrap.push(card);
  });

  return wrap;
}

/* ---------- SCREEN 3 ----------
Mostra as 10 categorias; admin clica numa categoria e todos vão para a próxima tela.
*/
function renderScreen3(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Escolha uma categoria</div>
  <div class="small">${localState.chosenCategory ? 'Escolhida: ' + localState.chosenCategory : ''}</div>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'category-grid';
  const categories = Object.keys(window.CATEGORIES || {});
  // if window.CATEGORIES undefined, build from localState.round? We can't access words.json client-side here but server shows categories via state? We'll construct categories from constant list for UI; server will validate chooseCategory.
  const catList = ['animais','tv e cinema','objetos','lugares','pessoas','esportes e jogos','profissões','alimentos','personagens','bíblico'];
  catList.forEach(cat => {
    const c = document.createElement('div');
    c.className = 'category';
    c.textContent = cat;
    c.onclick = ()=>{
      // only admin allowed to choose
      if (!isMeAdmin()){
        alert('Somente o admin pode escolher uma categoria.');
        return;
      }
      // choose
      socket.emit('chooseCategory', cat);
    };
    grid.appendChild(c);
  });
  container.appendChild(grid);
}

/* ---------- SCREEN 4 ----------
Lista players por equipe. Admin escolhe um player (select); quando admin escolhe um player,
aparece botão "Iniciar" apenas para o player escolhido. Quando o player escolhido clica "Iniciar",
ele entra na tela 5(a) (todos others vão para 5(b)).
*/
function renderScreen4(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Selecione um jogador</div>
  <div class="small">Categoria: ${localState.chosenCategory || '-'}</div>`;
  container.appendChild(header);

  const teams = getPlayerListByTeamFromLocal();
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';

  ['team1','team2'].forEach(tk=>{
    const col = document.createElement('div');
    col.className = 'panel';
    col.style.flex = '1';
    col.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${tk === 'team1' ? 'Equipe 1' : 'Equipe 2'}</div>`;
    teams[tk].forEach(p=>{
      const it = document.createElement('div');
      it.className = 'player-item' + (p.isAdmin ? ' admin' : '');
      it.style.cursor = isMeAdmin() ? 'pointer' : 'default';
      it.innerHTML = `<div>${p.name}${p.id === localState.selectedPlayerId ? ' • escolhido' : ''}</div>`;
      it.onclick = ()=>{
        if (!isMeAdmin()) return;
        // admin chooses player
        socket.emit('selectPlayer', p.id);
      };
      col.appendChild(it);
    });
    wrap.appendChild(col);
  });

  container.appendChild(wrap);

  // If I'm the selected player, show iniciar button
  if (localState.selectedPlayerId && mySocketId === localState.selectedPlayerId){
    const sec = document.createElement('div');
    sec.style.marginTop = '14px';
    const note = document.createElement('div');
    note.className = 'small-note';
    note.textContent = 'Você foi escolhido. Aperte iniciar quando estiver pronto.';
    sec.appendChild(note);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.style.marginTop = '8px';
    startBtn.textContent = 'Iniciar';
    startBtn.onclick = ()=>{
      socket.emit('playerStartRound');
    };
    sec.appendChild(startBtn);
    container.appendChild(sec);
  } else {
    const note = document.createElement('div');
    note.className = 'small-note';
    note.textContent = 'Aguardando o admin escolher um jogador...';
    container.appendChild(note);
  }
}

/* ---------- SCREEN 5 ----------
5(a) chosen player: timer + big word + dois botões (acertou/pular)
5(b) others: só o tempo
Quando tempo chega a 5s, 'pular' some (server emits)
*/
function renderScreen5(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Tempo</div>
  <div class="small">Categoria: ${localState.chosenCategory || '-'}</div>`;
  container.appendChild(header);

  const timerDiv = document.createElement('div');
  timerDiv.className = 'center';
  const t = document.createElement('div');
  t.className = 'timer';
  t.textContent = formatTime(localState.round.timeLeft || localState.round.duration || 75);
  timerDiv.appendChild(t);
  container.appendChild(timerDiv);

  // if I'm the selected player -> show word and buttons (5a)
  if (mySocketId === localState.selectedPlayerId){
    // check if skipping (server-side flag)
    if (localState.round.skipping){
      const skipping = document.createElement('div');
      skipping.className = 'center';
      skipping.style.marginTop = '16px';
      skipping.innerHTML = `<div class="title">Pulando...</div>`;
      container.appendChild(skipping);
    } else {
      const wordDiv = document.createElement('div');
      wordDiv.className = 'word center';
      wordDiv.style.marginTop = '6px';
      // show currentWord from state (server sends currentWord in state masked, but we also receive roundStarted with full currentWord)
      // For simplicity, server sends current word via 'roundStarted' or 'skipEnded' events; but also sanitized state shows currentWord (we used maskWord as passthrough)
      wordDiv.textContent = localState.round.currentWord || '';
      container.appendChild(wordDiv);

      const actions = document.createElement('div');
      actions.className = 'big-actions center';
      actions.style.marginTop = '18px';

      const acertou = document.createElement('button');
      acertou.className = 'circle-btn green';
      acertou.textContent = 'Acertou';
      acertou.onclick = () => {
        socket.emit('guess');
      };

      const pular = document.createElement('button');
      pular.className = 'circle-btn red';
      pular.textContent = 'Pular';
      pular.onclick = () => {
        socket.emit('skip');
      };

      actions.appendChild(acertou);
      actions.appendChild(pular);
      container.appendChild(actions);
    }
    // show team score
    const score = document.createElement('div');
    score.className = 'small-note';
    score.style.marginTop = '12px';
    score.textContent = `Placar — Equipe 1: ${localState.round.teamScores.team1}  •  Equipe 2: ${localState.round.teamScores.team2}`;
    container.appendChild(score);
  } else {
    // 5(b) others: only timer (already shown). show small-note
    const note = document.createElement('div');
    note.className = 'small-note';
    note.style.marginTop = '12px';
    note.textContent = 'Aguarde — jogador em ação.';
    container.appendChild(note);
  }
}

/* ---------- SCREEN 6 ----------
Mostra palavras acertadas em verde e puladas em vermelho. Botão 'categorias' (admin-only).
*/
function renderScreen6(container){
  const header = document.createElement('div');
  header.className = 'header-row';
  header.innerHTML = `<div class="title">Resultado</div>
  <div class="small">Categoria: ${localState.chosenCategory || '-'}</div>`;
  container.appendChild(header);

  const wordsWrap = document.createElement('div');
  wordsWrap.className = 'words-list';

  (localState.round.guessed || []).forEach(g=>{
    const w = document.createElement('div');
    w.className = 'word-entry guessed';
    w.textContent = `${g.word} • ${g.byTeam === 'team1' ? 'Equipe 1' : 'Equipe 2'}`;
    wordsWrap.appendChild(w);
  });
  (localState.round.skipped || []).forEach(s=>{
    const w = document.createElement('div');
    w.className = 'word-entry skipped';
    w.textContent = `${s}`;
    wordsWrap.appendChild(w);
  });
  container.appendChild(wordsWrap);

  const score = document.createElement('div');
  score.className = 'small-note';
  score.style.marginTop = '12px';
  score.textContent = `Placar final — Equipe 1: ${localState.round.teamScores.team1}  •  Equipe 2: ${localState.round.teamScores.team2}`;
  container.appendChild(score);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const catBtn = document.createElement('button');
  catBtn.className = 'btn';
  catBtn.textContent = 'Categorias';
  catBtn.onclick = ()=>{
    socket.emit('backToCategories');
  };
  if (!isMeAdmin()) catBtn.disabled = true;
  footer.appendChild(catBtn);
  container.appendChild(footer);
}

/* ---------- Helpers ---------- */

function isMeAdmin(){
  // Determine by comparing my socket id in last known server state players list
  const p = (localState.players || []).find(x => x.id === mySocketId);
  return p && p.isAdmin;
}

function getPlayerListByTeamFromLocal(){
  const teams = { lobby: [], team1: [], team2: [] };
  (localState.players || []).forEach(p=>{
    const t = p.team || 'lobby';
    teams[t] = teams[t] || [];
    teams[t].push(p);
  });
  return teams;
}

// initial request to get players list (if we already joined before)
socket.on('connect', ()=>{
  // nothing, server will send state
});

// small UX: remember typed name in local var; when user types in screen1 we used myNameRaw
// but we must also react to server telling us we joined (we don't have event). For simplicity, when user clicks Confirm we sent joinWithName and confirm which will register them server-side.

render();
