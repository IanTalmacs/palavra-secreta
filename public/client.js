// client.js
const socket = io();
let myId = null;
let myName = null;
let isAdmin = false;
let localState = null;
let skipHidden = false;
let skipAnimating = false;

// helper to get element
function el(id){ return document.getElementById(id); }
const app = document.getElementById('app');

// beforeunload warning
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

// receive full state
socket.on('state', (s) => {
  // store snapshot
  localState = s;
  renderApp();
  // request chosen word if I'm chosen
  if (s.currentRound && s.currentRound.selectedPlayerId === myId) {
    // server sends chosenWord via 'chosenWord' targeted emit, but force request by doing nothing
  }
});

socket.on('tick', ({ remaining }) => {
  if (localState) {
    localState.currentRound.remaining = remaining;
    // update timer UI
    updateTimer(remaining);
  }
});

socket.on('chosenWord', ({ currentWord, remaining }) => {
  if (!localState) return;
  localState.currentRound.currentWord = currentWord;
  localState.currentRound.remaining = remaining;
  renderApp();
});

socket.on('skip-start', () => {
  skipAnimating = true;
  renderApp();
});
socket.on('skip-end', () => {
  skipAnimating = false;
  renderApp();
});

socket.on('roundEnded', ({ wordStatuses, scores }) => {
  if (!localState) return;
  localState.screen = 6;
  localState.currentRound.wordStatuses = wordStatuses;
  localState.scores = scores;
  renderApp();
});

// On connect, receive own id from socket
socket.on('connect', () => {
  myId = socket.id;
});

// UI rendering
function renderApp() {
  const s = localState || { screen:1, players:[], lobbyOrder:[], team1:[], team2:[], adminId:null, categoriesSelected:[], currentRound:{}, scores:{team1:0,team2:0} };
  isAdmin = s.adminId === myId;
  // top-level container
  app.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'card';
  header.innerHTML = `<div class="h1">Party Words</div><div class="h2">Tela ${s.screen}</div>`;
  app.appendChild(header);

  // Render screens
  if (s.screen === 1) renderScreen1(s);
  else if (s.screen === 2) renderScreen2(s);
  else if (s.screen === 3) renderScreen3(s);
  else if (s.screen === 4) renderScreen4(s);
  else if (s.screen === 5) renderScreen5(s);
  else if (s.screen === 6) renderScreen6(s);

  // footer controls (admin only navigation)
  const footer = document.createElement('div');
  footer.className = 'footer card';
  const txt = document.createElement('div');
  txt.className = 'small-muted';
  txt.innerText = isAdmin ? 'Você é ADMIN — controles visíveis' : 'Participante';
  footer.appendChild(txt);

  if (isAdmin) {
    const btnRow = document.createElement('div');
    btnRow.style.flex = '1';
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn ghost';
    prevBtn.style.minWidth = '120px';
    prevBtn.innerText = 'Voltar';
    prevBtn.onclick = () => {
      const target = Math.max(1, (localState?.screen || 1) - 1);
      socket.emit('gotoScreen', target);
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn';
    nextBtn.style.minWidth = '120px';
    nextBtn.innerText = 'Avançar';
    nextBtn.onclick = () => {
      socket.emit('gotoScreen', Math.min(6, (localState?.screen || 1) + 1));
    };

    btnRow.appendChild(prevBtn);
    btnRow.appendChild(nextBtn);
    footer.appendChild(btnRow);
  }

  app.appendChild(footer);
}

/* Screen 1 - name input */
function renderScreen1(s) {
  const card = document.createElement('div');
  card.className = 'card';
  const input = document.createElement('input');
  input.className = 'input';
  input.placeholder = 'Digite seu nome (adicione 9999 no nome para ser Admin)';
  input.value = myName || '';
  input.oninput = (e) => { myName = e.target.value; };
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') confirmName();
  });

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.innerText = 'Confirmar';
  btn.onclick = confirmName;

  card.appendChild(input);
  card.appendChild(document.createElement('div'));
  card.appendChild(btn);
  app.appendChild(card);

  // show current players (if any)
  const playersCard = document.createElement('div');
  playersCard.className = 'card';
  playersCard.innerHTML = `<div class="h2">Jogadores conectados</div>`;
  const list = document.createElement('div'); list.className = 'list';
  (s.players || []).forEach(p => {
    const it = document.createElement('div');
    it.className = 'player' + (p.isAdmin ? ' admin' : '');
    it.innerHTML = `<div class="pin">${p.name[0] || '?'}</div><div><div style="font-weight:700">${p.name}</div><div class="small">${p.team}</div></div>`;
    list.appendChild(it);
  });
  playersCard.appendChild(list);
  app.appendChild(playersCard);
}

function confirmName() {
  if (!myName || !myName.trim()) {
    alert('Digite um nome');
    return;
  }
  socket.emit('setName', { name: myName });
}

/* Screen 2 - Lobby and Teams, button categorias below */
function renderScreen2(s) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="h1">Lobby</div><div class="h2">Arraste jogadores (apenas admin)</div>`;
  // columns
  const columns = document.createElement('div'); columns.className = 'columns';
  const lobbyCol = document.createElement('div'); lobbyCol.className = 'col card';
  lobbyCol.innerHTML = `<h3>Lobby</h3>`;
  const team1Col = document.createElement('div'); team1Col.className = 'col card';
  team1Col.innerHTML = `<h3>Equipe 1 (pontuação: ${s.scores?.team1||0})</h3>`;
  const team2Col = document.createElement('div'); team2Col.className = 'col card';
  team2Col.innerHTML = `<h3>Equipe 2 (pontuação: ${s.scores?.team2||0})</h3>`;

  // helper to create player element
  const makePlayerEl = (pid) => {
    const p = s.players.find(x => x.id === pid);
    if (!p) return null;
    const div = document.createElement('div');
    div.className = 'player';
    if (p.isAdmin) div.classList.add('admin');
    div.draggable = isAdmin;
    div.dataset.playerId = p.id;
    div.innerHTML = `<div class="pin">${p.name[0] || '?'}</div><div style="flex:1"><div style="font-weight:700">${p.name}</div><div class="small">${p.isAdmin ? 'Admin' : ''}</div></div>`;
    if (isAdmin) {
      div.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', p.id);
      });
    }
    return div;
  };

  // populate lobby in order
  const lobbyList = document.createElement('div'); lobbyList.className = 'list';
  (s.lobbyOrder || []).forEach(pid => {
    const elp = makePlayerEl(pid);
    if (elp) lobbyList.appendChild(elp);
  });
  lobbyCol.appendChild(lobbyList);

  // populate teams
  const team1List = document.createElement('div'); team1List.className = 'list';
  (s.team1 || []).forEach(pid => {
    const elp = makePlayerEl(pid);
    if (elp) team1List.appendChild(elp);
  });
  team1Col.appendChild(team1List);

  const team2List = document.createElement('div'); team2List.className = 'list';
  (s.team2 || []).forEach(pid => {
    const elp = makePlayerEl(pid);
    if (elp) team2List.appendChild(elp);
  });
  team2Col.appendChild(team2List);

  columns.appendChild(lobbyCol);
  columns.appendChild(team1Col);
  columns.appendChild(team2Col);
  card.appendChild(columns);

  // drag/drop handlers for admin
  [lobbyCol, team1Col, team2Col].forEach(col => {
    col.addEventListener('dragover', (e) => {
      if (!isAdmin) return;
      e.preventDefault();
      col.style.outline = '2px dashed rgba(255,255,255,0.04)';
    });
    col.addEventListener('dragleave', () => {
      col.style.outline = '';
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.style.outline = '';
      if (!isAdmin) return;
      const pid = e.dataTransfer.getData('text/plain');
      if (!pid) return;
      let to = 'lobby';
      if (col === team1Col) to = 'team1';
      if (col === team2Col) to = 'team2';
      socket.emit('movePlayer', { playerId: pid, to });
    });
  });

  app.appendChild(card);

  // Categories button below
  const catCard = document.createElement('div'); catCard.className = 'card';
  const btnCat = document.createElement('button');
  btnCat.className = 'btn';
  btnCat.innerText = 'Categorias';
  btnCat.onclick = () => {
    // only admin can navigate to categories
    if (!isAdmin) {
      alert('Apenas o admin pode abrir Categorias.');
      return;
    }
    socket.emit('gotoScreen', 3);
  };
  catCard.appendChild(btnCat);
  app.appendChild(catCard);
}

/* Screen 3 - Categories selection */
function renderScreen3(s) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="h1">Categorias</div><div class="h2">Selecione as categorias (apenas admin)</div>`;
  const grid = document.createElement('div'); grid.className = 'cat-grid';
  // categories list (must match server words.json keys)
  const keys = Object.keys(window.initialWords || {});
  // but client may not have initialWords; we'll use built-in fallback (categories common in words.json)
  const fallback = ['animais','tv_e_cinema','objetos','lugares','pessoas','esportes_e_jogos','profissões','alimentos','personagens','biblico'];
  const cats = keys.length ? keys : fallback;

  cats.forEach(cat => {
    const box = document.createElement('div');
    box.className = 'cat';
    box.style.background = s.categoriesSelected && s.categoriesSelected.includes(cat) ? 'linear-gradient(180deg, rgba(29,185,84,0.12), transparent)' : 'transparent';
    box.style.border = '1px solid rgba(255,255,255,0.03)';
    box.innerText = cat.replace(/_/g,' ').toUpperCase();
    box.onclick = () => {
      if (!isAdmin) { alert('Apenas admin pode selecionar categorias'); return; }
      socket.emit('toggleCategory', cat);
    };
    grid.appendChild(box);
  });

  card.appendChild(grid);

  // finalize button => build pool and goto screen 4
  const finalize = document.createElement('button');
  finalize.className = 'btn';
  finalize.style.marginTop = '12px';
  finalize.innerText = 'Confirmar categorias';
  finalize.onclick = () => {
    if (!isAdmin) return;
    socket.emit('finalizeCategories');
  };

  card.appendChild(finalize);
  app.appendChild(card);
}

/* Screen 4 - Choose player from list. Admin selects; chosen player sees "Iniciar" button. */
function renderScreen4(s) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="h1">Escolha um jogador</div><div class="h2">Admin seleciona; o jogador escolhido verá botão Iniciar</div>`;

  // list all players
  const list = document.createElement('div'); list.className = 'list';
  (s.players || []).forEach(p => {
    const item = document.createElement('div');
    item.className = 'player';
    if (s.currentRound && s.currentRound.selectedPlayerId === p.id) item.style.outline = '2px solid rgba(29,185,84,0.12)';
    item.innerHTML = `<div class="pin">${p.name[0]||'?'}</div><div style="flex:1"><div style="font-weight:700">${p.name}</div><div class="small">${p.team}</div></div>`;
    // admin clicking selects
    item.onclick = () => {
      if (!isAdmin) return; // only admin selects
      socket.emit('selectPlayerForTurn', p.id);
    };
    list.appendChild(item);
  });
  card.appendChild(list);

  // below, if current client is the chosen player, show 'Iniciar' button
  const chosen = s.currentRound && s.currentRound.selectedPlayerId;
  if (chosen && chosen === myId) {
    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.style.marginTop = '12px';
    startBtn.innerText = 'Iniciar';
    startBtn.onclick = () => {
      socket.emit('startRound');
    };
    card.appendChild(startBtn);
  } else {
    const info = document.createElement('div');
    info.className = 'small-muted';
    if (!chosen) info.innerText = isAdmin ? 'Selecione um jogador' : 'Aguardando admin escolher um jogador';
    else info.innerText = 'Aguardando jogador escolhido iniciar';
    card.appendChild(info);
  }

  app.appendChild(card);
}

/* Screen 5 - gameplay
   5(a): the chosen player sees word + buttons "acertou"/"pular" (green/red)
   5(b): other players just see timer
*/
function renderScreen5(s) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="h1">Rodada</div><div class="h2">Tempo restante</div>`;

  const center = document.createElement('div'); center.className = 'center-screen';

  // timer
  const timer = document.createElement('div'); timer.className = 'timer-big';
  const remaining = (s.currentRound && s.currentRound.remaining) || 0;
  timer.innerText = formatTime(remaining);
  center.appendChild(timer);

  const chosenId = s.currentRound && s.currentRound.selectedPlayerId;
  const iAmChosen = chosenId === myId;
  // if chosen show word and buttons (unless skip animating)
  if (iAmChosen) {
    if (skipAnimating) {
      const p = document.createElement('div'); p.className = 'word-big';
      p.innerText = 'Pulando...';
      center.appendChild(p);
    } else {
      // show current word (note: server sends chosenWord event to chosen player with currentWord)
      const word = s.currentRound && s.currentRound.currentWord;
      const showWord = document.createElement('div'); showWord.className = 'word-big';
      showWord.innerText = (word && word.text) ? word.text.toUpperCase() : '...';
      center.appendChild(showWord);

      // buttons
      const row = document.createElement('div'); row.className = 'circle-btns';
      // acertou
      const ok = document.createElement('div'); ok.className = 'circle green'; ok.innerText = 'ACERTOU';
      ok.onclick = () => {
        socket.emit('correct');
      };
      // pular: hide it when <=5 seconds
      const skipBtn = document.createElement('div'); skipBtn.className = 'circle red'; skipBtn.innerText = 'PULAR';
      if (remaining <= 5) {
        skipBtn.style.display = 'none';
      } else {
        skipBtn.onclick = () => {
          socket.emit('skip');
        };
      }
      row.appendChild(ok); row.appendChild(skipBtn);
      center.appendChild(row);
    }
  } else {
    // non-chosen players only see timer and a message
    const msg = document.createElement('div'); msg.className = 'small-muted';
    msg.innerText = 'Aguardando o jogador responder...';
    center.appendChild(msg);
  }

  card.appendChild(center);
  app.appendChild(card);
}

/* Screen 6 - show results words (green/red) and button categorias */
function renderScreen6(s) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<div class="h1">Resultados</div><div class="h2">Palavras acertadas/puladas</div>`;
  const list = document.createElement('div'); list.className = 'list';
  (s.currentRound && s.currentRound.wordStatuses || []).forEach(w => {
    const item = document.createElement('div');
    item.className = 'player';
    const color = w.status === 'correct' ? 'color: #10B981' : 'color: #EF4444';
    item.innerHTML = `<div style="flex:1"><div style="font-weight:700; ${color}">${w.word}</div><div class="small">${w.status}</div></div>`;
    list.appendChild(item);
  });
  card.appendChild(list);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.style.marginTop = '12px';
  btn.innerText = 'Categorias';
  btn.onclick = () => {
    if (!isAdmin) {
      alert('Apenas admin pode mexer nas categorias.');
      return;
    }
    socket.emit('gotoScreen', 3);
  };
  card.appendChild(btn);

  // scores
  const scores = document.createElement('div');
  scores.className = 'small-muted';
  scores.style.marginTop = '12px';
  scores.innerText = `Placar — Equipe 1: ${s.scores?.team1||0}  |  Equipe 2: ${s.scores?.team2||0}`;
  card.appendChild(scores);

  app.appendChild(card);
}

/* utils */
function formatTime(sec) {
  if (sec < 0) sec = 0;
  const s = sec % 60;
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateTimer(remaining) {
  // simple rerender
  renderApp();
}

/* On initial load, fetch words.json so client can display categories in screen 3 nicely */
fetch('/words.json').then(r => r.json()).then(data => {
  window.initialWords = data;
}).catch(()=>{ window.initialWords = {}; });

/* Small: when user reloads, they must confirm (browser handled via beforeunload) */
