// public/client.js
const socket = io();
let myId = null;
let amAdmin = false;
let currentScreen = 1;
let chosenId = null;
let localIsChooser = false;
let skipHidden = false;
let skipTimeout = null;
const el = (id) => document.getElementById(id);
function showScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const s = el('screen-' + n);
  if (s) s.classList.remove('hidden');
  currentScreen = n;
}
el('confirmName').addEventListener('click', () => {
  const name = el('nameInput').value.trim();
  if (!name) return;
  socket.emit('join', name);
  showScreen(2);
});
el('categoriesBtn').addEventListener('click', () => {
  socket.emit('startCategories');
});
el('finalizarBtn').addEventListener('click', () => {
  el('confirmModal').classList.remove('hidden');
});
el('confirmNo').addEventListener('click', () => {
  el('confirmModal').classList.add('hidden');
});
el('confirmYes').addEventListener('click', () => {
  el('confirmModal').classList.add('hidden');
  socket.emit('finalizeGame', true);
});
el('advanceBtn').addEventListener('click', () => {
  socket.emit('advanceAfterTurn');
});
el('startBtn').addEventListener('click', () => {
  socket.emit('startTurn');
});
el('correctBtn').addEventListener('click', () => {
  socket.emit('correct');
});
el('skipBtn').addEventListener('click', () => {
  socket.emit('skip');
});
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});
socket.on('joined', (id) => {
  myId = id;
});
socket.on('joinedAsAdmin', () => {
  amAdmin = true;
});
socket.on('state', (s) => {
  renderState(s);
});
socket.on('prepareChooser', ({ chooserId, chooserName }) => {
  el('chooserName').textContent = chooserName;
  showScreen(4);
});
socket.on('turnStarted', ({ chooserId }) => {
  if (myId === chooserId) {
    localIsChooser = true;
    showScreen(5);
    el('actionButtons').classList.remove('hidden');
  } else {
    localIsChooser = false;
    showScreen(5bScreenId());
  }
});
socket.on('newWord', (w) => {
  if (w) {
    el('wordBox').textContent = w;
    el('wordBox').classList.remove('hidden');
    el('actionButtons').classList.remove('hidden');
  } else {
    el('wordBox').textContent = '...';
  }
});
socket.on('skipping', () => {
  el('wordBox').textContent = 'pulando...';
  el('actionButtons').classList.add('hidden');
});
socket.on('time', (t) => {
  el('timerLarge') && (el('timerLarge').textContent = t);
  el('timerOnly') && (el('timerOnly').textContent = t);
  if (t <= 5) {
    skipHidden = true;
    el('skipBtn') && (el('skipBtn').style.display = 'none');
  } else {
    skipHidden = false;
    el('skipBtn') && (el('skipBtn').style.display = '');
  }
});
socket.on('noMoreWords', () => {
  el('wordBox').textContent = '';
  el('actionButtons').classList.add('hidden');
});
socket.on('state', (s) => {
  renderState(s);
});
function pItem(id, name) {
  const li = document.createElement('li');
  li.className = 'player-item';
  li.draggable = true;
  li.dataset.id = id;
  li.textContent = name;
  li.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
  });
  return li;
}
function renderState(s) {
  el('scoreboard').textContent = `Equipe1 ${s.scores.team1} — Equipe2 ${s.scores.team2}`;
  renderLobbyAndTeams(s);
  renderCategories(s);
  if (s.screen === 1) showScreen(1);
  if (s.screen === 2) showScreen(2);
  if (s.screen === 3) showScreen(3);
  if (s.screen === 7) {
    showScreen(7);
    el('finalScores').innerHTML = `<div>Equipe1: ${s.scores.team1}</div><div>Equipe2: ${s.scores.team2}</div>`;
  }
  if (s.screen === 6) {
    showScreen(6);
    const list = el('resultsList');
    list.innerHTML = '';
    s.turnWords.correct.forEach(w => {
      const d = document.createElement('div');
      d.className = 'result-word result-correct';
      d.textContent = w;
      list.appendChild(d);
    });
    s.turnWords.skipped.forEach(w => {
      const d = document.createElement('div');
      d.className = 'result-word result-skipped';
      d.textContent = w;
      list.appendChild(d);
    });
  }
}
function renderLobbyAndTeams(s) {
  const lobby = el('lobbyList');
  const t1 = el('team1List');
  const t2 = el('team2List');
  lobby.innerHTML = '';
  t1.innerHTML = '';
  t2.innerHTML = '';
  s.lobby.forEach(id => {
    const name = s.players[id]?.name || 'Jogador';
    lobby.appendChild(pItem(id, name));
  });
  s.teams.team1.forEach(id => {
    const name = s.players[id]?.name || 'Jogador';
    t1.appendChild(pItem(id, name));
  });
  s.teams.team2.forEach(id => {
    const name = s.players[id]?.name || 'Jogador';
    t2.appendChild(pItem(id, name));
  });
  addDnD(lobby, 'lobby');
  addDnD(t1, 'team1');
  addDnD(t2, 'team2');
  if (!s.isAdmin) {
    el('categoriesBtn').style.display = 'none';
    el('finalizarBtn').style.display = 'none';
  } else {
    el('categoriesBtn').style.display = '';
    el('finalizarBtn').style.display = '';
  }
}
function addDnD(container, team) {
  container.querySelectorAll('.player-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.dataset.id);
    });
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    socket.emit('movePlayer', { playerId: id, toTeam: team });
  });
}
function renderCategories(s) {
  const grid = el('categoriesGrid');
  grid.innerHTML = '';
  s.categories.forEach(cat => {
    const d = document.createElement('div');
    d.className = 'category';
    d.textContent = cat;
    d.addEventListener('click', () => {
      if (!s.isAdmin) return;
      socket.emit('selectCategory', cat);
    });
    grid.appendChild(d);
  });
}
function p5Screen() {
  return amAdmin ? 5 : 5;
}
function p5bScreenId() {
  return 5 + 'b'.replace('b','b') ? 5 : 5;
}
setInterval(() => {
  socket.emit('requestState');
}, 1000);
socket.emit('requestState');
