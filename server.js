const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'data.json');
const SAVE_INTERVAL_MS = 5000; // salva o estado a cada 5s
const INACTIVITY_DELETE_MS = 2 * 60 * 60 * 1000; // 2 horas

// carrega ou cria estado
let state = { rooms: {}, sockets: {} };
try {
  if (fs.existsSync(DATA_FILE)) {
    state = JSON.parse(fs.readFileSync(DATA_FILE));
  }
} catch (e) {
  console.error('Erro ao carregar data.json', e);
}

function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Erro ao salvar estado', e);
  }
}

setInterval(saveState, SAVE_INTERVAL_MS);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// palavras por categoria (exemplo). Expandir conforme desejar.
const WORDS = {
  animais: ["cachorro","gato","elefante","leao","tartaruga","girafa","macaco","coelho","vaca","ovelha","tigre","zebra","canguru","pinguim","golfinho","aranha","pato","galinha","porco","rato"],
  "tv e cinema": ["titanic","matrix","friends","breaking bad","joker","avengers","batman","superman","godzilla","frozen","inception","parasita","toy story","star wars","lotr","joker","parasita"],
  objetos: ["cadeira","mesa","telefone","caneta","copodeagua","chave","relógio","garrafa","teclado","monitor","livro","sapato","cadeado","escova","espelho"],
  lugares: ["praia","montanha","cidade","floresta","deserto","lago","rio","ilha","pais","porto","aeroporto","estacao"],
  pessoas: ["presidente","médico","professor","ator","cantor","pintor","cientista","piloto","engenheiro","jogador"],
  "esportes e jogos": ["futebol","basquete","xadrez","tenis","volei","boliche","ping pong","poker","xadrez"],
  profissoes: ["advogado","dentista","enfermeiro","programador","arquiteto","engenheiro","cozinheiro","jornalista"],
  alimentos: ["arroz","feijao","macarrao","pizza","sanduiche","salada","chocolate","bolo"],
  personagens: ["moana","mickey","minnie","thor","loki","harry potter","hermione","gandalf"],
  biblico: ["moises","davi","jesus","paulo","maria","josue","noe","abel"]
};

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// util: cria nova sala
function createRoom(ownerDeviceName, ownerSocketId) {
  const id = uuidv4();
  const room = {
    id,
    name: `sala de ${ownerDeviceName}`,
    ownerDeviceName,
    ownerSocketId,
    ownerDeviceId: ownerDeviceName,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: {}, // key: deviceId
    teams: [{ name: 'Equipe 1', order: [] }, { name: 'Equipe 2', order: [] }],
    maxPlayers: 10,
    categories: Object.keys(WORDS),
    usedWords: {},
    current: null, // estado da rodada
    scores: [0,0],
    started: false,
    locked: false // quando o dono clicar iniciar
  };
  state.rooms[id] = room;
  return room;
}

// limpa salas inativas
function cleanupInactiveRooms() {
  const now = Date.now();
  for (const id of Object.keys(state.rooms)) {
    const room = state.rooms[id];
    if (!room) continue;
    const playersCount = Object.keys(room.players).length;
    if (playersCount === 0 && now - room.lastActivity > INACTIVITY_DELETE_MS) {
      delete state.rooms[id];
      io.emit('rooms_list', getRoomsSummary());
    }
  }
}
setInterval(cleanupInactiveRooms, 60 * 1000);

function getRoomsSummary() {
  return Object.values(state.rooms).map(r => ({ id: r.id, name: r.name, count: Object.keys(r.players).length, ownerDeviceId: r.ownerDeviceId, locked: r.locked }));
}

// socket handling
io.on('connection', (socket) => {
  socket.on('register', (payload) => {
    // payload: { deviceName }
    const deviceName = payload.deviceName || 'player';
    state.sockets[socket.id] = { socketId: socket.id, deviceName, deviceId: deviceName, lastSeen: Date.now() };
    socket.emit('rooms_list', getRoomsSummary());
    // reply with entire state optionally
  });

  socket.on('create_room', ({ deviceName }) => {
    // verifica se device já tem sala
    const existing = Object.values(state.rooms).find(r => r.ownerDeviceId === deviceName);
    if (existing) {
      socket.emit('create_room_failed', { reason: 'only_one' });
      return;
    }
    const room = createRoom(deviceName, socket.id);
    saveState();
    io.emit('rooms_list', getRoomsSummary());
  });

  socket.on('delete_room', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    delete state.rooms[roomId];
    io.emit('rooms_list', getRoomsSummary());
  });

  socket.on('join_room', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return socket.emit('join_failed', { reason: 'no_room' });
    if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('join_failed', { reason: 'full' });
    if (room.locked) return socket.emit('join_failed', { reason: 'locked' });

    // adiciona jogador
    room.players[deviceName] = { deviceId: deviceName, deviceName, socketId: socket.id, team: null, connected: true, lastSeen: Date.now() };
    room.lastActivity = Date.now();
    socket.join(roomId);
    // atualiza ordem de cada time null por enquanto
    io.to(roomId).emit('room_update', sanitizeRoom(room));
    io.emit('rooms_list', getRoomsSummary());
  });

  socket.on('leave_room', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    delete room.players[deviceName];
    room.lastActivity = Date.now();
    socket.leave(roomId);
    io.to(roomId).emit('room_update', sanitizeRoom(room));
    io.emit('rooms_list', getRoomsSummary());
  });

  socket.on('set_team', ({ roomId, deviceName, teamIndex }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (!room.players[deviceName]) return;
    // remove de outro team order
    for (let t=0;t<2;t++) room.teams[t].order = room.teams[t].order.filter(d => d !== deviceName);
    room.players[deviceName].team = teamIndex;
    room.teams[teamIndex].order.push(deviceName);
    room.lastActivity = Date.now();
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('rename_team', ({ roomId, deviceName, teamIndex, newName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    room.teams[teamIndex].name = newName;
    room.lastActivity = Date.now();
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('start_game', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    room.started = true;
    room.locked = true; // impede novos jogadores
    room.current = { phase: 'categories', pickedCategory: null, rotationIndex: [0,0], roundWords: [], timer: null };
    room.lastActivity = Date.now();
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('pick_category', ({ roomId, deviceName, category }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    if (!room.categories.includes(category)) return;
    // remove categoria da lista
    room.categories = room.categories.filter(c => c !== category);
    // inicializa rodada para equipe 1
    room.current.pickedCategory = category;
    room.current.phase = 'prepare';
    room.current.teamTurn = 0; // 0 equipe1, 1 equipe2
    room.current.roundWords = [];
    room.lastActivity = Date.now();
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('prepare_player', ({ roomId }) => {
    // comando do servidor para dizer quem é o próximo jogador — o cliente só precisa pedir atualização
    const room = state.rooms[roomId];
    if (!room) return;
    const teamIndex = room.current.teamTurn;
    const order = room.teams[teamIndex].order;
    if (!order || order.length === 0) return;
    const idx = room.current.rotationIndex[teamIndex] % order.length;
    const playerDevice = order[idx];
    io.to(roomId).emit('prepare_player', { deviceName: playerDevice, teamIndex });
  });

  socket.on('start_round', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    // somente o dono pode iniciar a contagem efetiva -> mas per spec, o criador inicia categories selection only; here we allow any to start if room.current.prepare is ready
    // escolhe jogador atual
    const teamIndex = room.current.teamTurn;
    const order = room.teams[teamIndex].order;
    if (!order || order.length === 0) return;
    const idx = room.current.rotationIndex[teamIndex] % order.length;
    const playerDevice = order[idx];

    // monta lista de palavras disponíveis para a categoria (exclui as usadas)
    const category = room.current.pickedCategory;
    const available = (WORDS[category] || []).filter(w => !(room.usedWords && room.usedWords[w]));
    // embaralha
    for (let i=available.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    // pega como fila
    room.current.wordsQueue = available.slice();
    room.current.roundWords = [];
    // timer persistente: define endTime
    const now = Date.now();
    room.current.timer = { startTime: now, durationMs: 75*1000, endTime: now + 75*1000, startedBy: deviceName, playerDevice };
    room.current.phase = 'playing';
    room.lastActivity = Date.now();

    // emitir evento de início
    io.to(roomId).emit('round_started', sanitizeRoom(room));

    // avisa o jogador escolhido explicitamente via socket
    const player = room.players[playerDevice];
    if (player && player.socketId) {
      io.to(player.socketId).emit('your_turn', { category, duration: 75 });
    }
  });

  socket.on('hit_word', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room || room.current.phase !== 'playing') return;
    // quem acionou? apenas o jogador escolhido deve poder, mas validar não estritamente
    const current = room.current;
    if (!current.wordsQueue || current.wordsQueue.length === 0) return;
    const word = current.wordsQueue.shift();
    current.roundWords.push({ word, result: 'hit' });
    room.usedWords[word] = true;
    room.scores[current.teamTurn] += 1;
    room.lastActivity = Date.now();
    io.to(roomId).emit('round_update', sanitizeRoom(room));
  });

  socket.on('skip_word', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room || room.current.phase !== 'playing') return;
    const current = room.current;
    if (!current.wordsQueue || current.wordsQueue.length === 0) return;
    const word = current.wordsQueue.shift();
    current.roundWords.push({ word, result: 'skipped' });
    room.usedWords[word] = true;
    room.lastActivity = Date.now();
    io.to(roomId).emit('round_update', sanitizeRoom(room));
  });

  socket.on('request_state', ({ roomId }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    socket.emit('room_update', sanitizeRoom(room));
  });

  socket.on('advance_after_review', ({ roomId, deviceName }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    // se foi equipe 0, passar para equipe 1; se já foi 1, finalizar categoria e voltar pra categories
    if (room.current.teamTurn === 0) {
      room.current.teamTurn = 1;
      // mantém mesma categoria, rotationIndex não muda
      room.current.phase = 'prepare';
    } else {
      // fim de ambas equipes — incrementar rotation indices
      room.current.rotationIndex[0]++;
      room.current.rotationIndex[1]++;
      room.current = { phase: 'categories', pickedCategory: null, rotationIndex: room.current.rotationIndex, roundWords: [] };
    }
    room.lastActivity = Date.now();
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('end_game_confirm', ({ roomId, deviceName, confirm }) => {
    const room = state.rooms[roomId];
    if (!room) return;
    if (room.ownerDeviceId !== deviceName) return;
    if (!confirm) {
      // volta pra categories
      room.current.phase = 'categories';
      io.to(roomId).emit('room_update', sanitizeRoom(room));
      return;
    }
    room.current.phase = 'finished';
    io.to(roomId).emit('room_update', sanitizeRoom(room));
  });

  socket.on('disconnect', () => {
    // marca socket como desconectado
    delete state.sockets[socket.id];
    // atualizar players conectados
    for (const rid of Object.keys(state.rooms)) {
      const room = state.rooms[rid];
      for (const dev of Object.keys(room.players)) {
        if (room.players[dev].socketId === socket.id) {
          room.players[dev].connected = false;
        }
      }
    }
    saveState();
  });
});

// sanitizar objeto room para enviar ao cliente
function sanitizeRoom(room) {
  const r = deepClone(room);
  // não enviar funções ou grandes estruturas
  return r;
}

// timer tick para emitir atualizações de tempo (persistente)
setInterval(() => {
  const now = Date.now();
  for (const rid of Object.keys(state.rooms)) {
    const room = state.rooms[rid];
    if (!room || !room.current) continue;
    const cur = room.current;
    if (cur.phase === 'playing' && cur.timer && cur.timer.endTime) {
      const remainingMs = cur.timer.endTime - now;
      if (remainingMs <= 0) {
        // fase de revisão
        cur.phase = 'review';
        // envia revisão
        io.to(rid).emit('round_ended', sanitizeRoom(room));
      } else {
        // envia update de tempo (segundos)
        io.to(rid).emit('timer', { remaining: Math.ceil(remainingMs/1000) });
      }
    }
  }
}, 900);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on', PORT));