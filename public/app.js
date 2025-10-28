const socket = io();
let myDeviceName = localStorage.getItem('deviceName') || '';
let currentRoom = null;

function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  if (!myDeviceName) return renderNameScreen(main);
  if (!currentRoom) return renderLobby(main);
  return renderRoom(main);
}

function renderNameScreen(main){
  const c = document.createElement('div'); c.className='card';
  const input = document.createElement('input'); input.className='input'; input.placeholder='Nome do dispositivo'; input.value='';
  const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Entrar';
  btn.onclick = () => { myDeviceName = input.value.trim() || ('Player'+Math.floor(Math.random()*1000)); localStorage.setItem('deviceName', myDeviceName); socket.emit('register',{deviceName:myDeviceName}); render(); }
  c.appendChild(input); c.appendChild(document.createElement('div')).style.height='8px'; c.appendChild(btn);
  main.appendChild(c);
}

let roomsList = [];
socket.on('rooms_list', (list) => { roomsList = list; render(); });

function renderLobby(main){
  const c = document.createElement('div'); c.className='card';
  const createBtn = document.createElement('button'); createBtn.className='btn'; createBtn.textContent='Criar sala';
  createBtn.onclick = () => socket.emit('create_room',{deviceName:myDeviceName});
  c.appendChild(createBtn);
  main.appendChild(c);

  const listCard = document.createElement('div'); listCard.className='card';
  roomsList.forEach(r => {
    const div = document.createElement('div'); div.className='room';
    const left = document.createElement('div'); left.innerHTML = `<div>${r.name}</div><div class='meta'>${r.count} jogadores</div>`;
    const right = document.createElement('div');
    const join = document.createElement('button'); join.className='btn'; join.textContent='Entrar';
    join.onclick = () => { socket.emit('join_room',{roomId:r.id, deviceName:myDeviceName}); currentRoom = r.id; setTimeout(()=>socket.emit('request_state',{roomId:currentRoom}),300); render(); };
    if (r.count >= 10 || r.locked) join.disabled = true;
    right.appendChild(join);
    div.appendChild(left); div.appendChild(right);
    listCard.appendChild(div);
  });
  main.appendChild(listCard);
}

socket.on('room_update', (room) => { if (room && room.id) { if (currentRoom === room.id) currentRoom = room.id; window.latestRoom = room; render(); } });

function renderRoom(main){
  const room = window.latestRoom || {};
  // header
  const hdr = document.createElement('div'); hdr.className='card'; hdr.innerHTML = `<div style='display:flex;justify-content:space-between;align-items:center'><div>${room.name||''}</div><div class='score'>${(room.scores||[0,0]).join(' - ')}</div></div>`;
  main.appendChild(hdr);

  // teams
  const teamsDiv = document.createElement('div'); teamsDiv.className='card';
  for (let i=0;i<2;i++){
    const t = room.teams ? room.teams[i] : {name:`Equipe ${i+1}`,order:[]};
    const teamEl = document.createElement('div'); teamEl.className='team';
    const title = document.createElement('div'); title.textContent = t.name + ` (${t.order ? t.order.length : 0})`;
    const joinBtn = document.createElement('button'); joinBtn.className='btn'; joinBtn.textContent='Entrar na equipe';
    joinBtn.onclick = () => socket.emit('set_team',{roomId:room.id, deviceName:myDeviceName, teamIndex:i});
    teamEl.appendChild(title); teamEl.appendChild(joinBtn);
    // player list
    const list = document.createElement('div'); list.style.marginTop='8px'; (t.order||[]).forEach(pn => { const p = document.createElement('div'); p.textContent = pn; list.appendChild(p); });
    teamEl.appendChild(list);
    teamsDiv.appendChild(teamEl);
  }
  main.appendChild(teamsDiv);

  // categories
  const catCard = document.createElement('div'); catCard.className='card';
  (room.categories||[]).forEach(cat => { const b=document.createElement('button'); b.className='btn'; b.style.margin='6px'; b.textContent=cat; b.onclick = ()=> socket.emit('pick_category',{roomId:room.id, deviceName:myDeviceName, category:cat}); catCard.appendChild(b); });
  const endBtn = document.createElement('button'); endBtn.className='btn-purple'; endBtn.textContent='Finalizar'; endBtn.onclick = ()=> { if (confirm('Deseja mesmo encerrar?')) socket.emit('end_game_confirm',{roomId:room.id, deviceName:myDeviceName, confirm:true}); };
  catCard.appendChild(endBtn);
  main.appendChild(catCard);

  // play area: show current phase
  const play = document.createElement('div'); play.className='card';
  if (room.current && room.current.phase === 'playing'){
    // show timer center; if i'm the chosen player, show word and buttons
    const remaining = Math.ceil((room.current.timer.endTime - Date.now())/1000);
    const timer = document.createElement('div'); timer.className='timer'; timer.textContent = Math.max(0, remaining);
    play.appendChild(timer);
    const playerDevice = room.current.timer.playerDevice;
    if (playerDevice === myDeviceName){
      const word = (room.current.wordsQueue && room.current.wordsQueue[0]) || (room.current.roundWords[room.current.roundWords.length-1]||{}).word || '';
      const wdiv = document.createElement('div'); wdiv.className='big-words'; wdiv.textContent = word;
      const btns = document.createElement('div'); btns.style.display='flex'; btns.style.justifyContent='center'; btns.style.gap='12px';
      const ok = document.createElement('button'); ok.className='btn'; ok.textContent='acertou'; ok.onclick = ()=> socket.emit('hit_word',{roomId:room.id, deviceName:myDeviceName});
      const skip = document.createElement('button'); skip.className='btn'; skip.textContent='pular'; skip.onclick = ()=> { socket.emit('skip_word',{roomId:room.id, deviceName:myDeviceName}); skip.style.display='none'; setTimeout(()=>{ skip.style.display='inline-block'; },3000); };
      btns.appendChild(ok); btns.appendChild(skip);
      play.appendChild(wdiv); play.appendChild(btns);
    } else {
      const waiting = document.createElement('div'); waiting.className='big-words'; waiting.textContent = 'Aguardando...'; play.appendChild(waiting);
    }
  } else if (room.current && room.current.phase === 'review'){
    const list = document.createElement('div'); (room.current.roundWords||[]).forEach(rw => { const el = document.createElement('div'); el.textContent = rw.word; el.style.color = rw.result === 'hit' ? '#1db954' : '#ff4d4d'; list.appendChild(el); });
    play.appendChild(list);
    if (room.ownerDeviceId === myDeviceName){ const adv = document.createElement('button'); adv.className='btn'; adv.textContent='Avançar'; adv.onclick = ()=> socket.emit('advance_after_review',{roomId:room.id, deviceName:myDeviceName}); play.appendChild(adv); }
  } else if (room.current && room.current.phase === 'prepare'){
    const prep = document.createElement('div'); prep.textContent = 'Preparar...';
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Iniciar'; btn.onclick = ()=> socket.emit('start_round',{roomId:room.id, deviceName:myDeviceName});
    play.appendChild(prep); play.appendChild(btn);
  } else if (room.current && room.current.phase === 'finished'){
    const fin = document.createElement('div'); fin.textContent = 'Fim. Placar: ' + (room.scores||[0,0]).join(' - ');
    play.appendChild(fin);
  } else {
    play.textContent = 'Aguardando ações.';
  }
  main.appendChild(play);
}

// warning before close
window.addEventListener('beforeunload', (e)=>{ e.preventDefault(); e.returnValue = ''; });

// inicial
socket.emit('register', { deviceName: myDeviceName });
render();

// updates de timer do servidor
socket.on('timer', (t)=>{ const el = document.querySelector('.timer'); if (el) el.textContent = t.remaining; });