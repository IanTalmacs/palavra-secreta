const socket = io();
const app = document.getElementById("app");
let me = {};
let wordsHit = [];
let wordsSkipped = [];
let timer;

window.addEventListener("beforeunload", e => {
  e.preventDefault();
  e.returnValue = "";
});

function screen1() {
  app.innerHTML = `
    <h1>Jogo Categorias</h1>
    <input id="name" placeholder="Seu nome" style="padding:10px;font-size:1.2em;width:80%"><br>
    <button onclick="join(1)">Equipe 1</button>
    <button onclick="join(2)">Equipe 2</button>
  `;
}

function join(team) {
  const name = document.getElementById("name").value;
  if (!name) return;
  me.name = name;
  me.team = team;
  socket.emit("join", name, team);
  screen2();
}

function screen2() {
  app.innerHTML = `
    <h2 id="score">Placar</h2>
    <div class="category">
      ${["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissões","alimentos","personagens","bíblico"].map(c => `<button onclick="chooseCategory('${c}')">${c}</button>`).join("")}
    </div>
  `;
}

function chooseCategory(cat) {
  socket.emit("chooseCategory", cat);
}

function screen3(players) {
  app.innerHTML = `<h2>Escolha um jogador</h2>`;
  players.forEach(p => {
    app.innerHTML += `<button onclick="choosePlayer('${p.id}')">${p.name}</button>`;
  });
}

function choosePlayer(id) {
  socket.emit("choosePlayer", id);
}

function screen4a() {
  app.innerHTML = `<h2 id="time">75</h2><div class="word" id="word"></div>
    <button class="green" onclick="correct()">Acertou</button>
    <button class="red" onclick="skip()">Pular</button>`;
  wordsHit = [];
  wordsSkipped = [];
  countdown(75);
  socket.emit("getWord");
}

function screen4b() {
  app.innerHTML = `<h2 id="time">75</h2>`;
  countdown(75);
}

function screen5(results) {
  app.innerHTML = `
    <h2>Resultado</h2>
    ${results.hits.map(w => `<div class="green">${w}</div>`).join("")}
    ${results.skips.map(w => `<div class="red">${w}</div>`).join("")}
    <button onclick="screen2()">Categorias</button>
  `;
}

function countdown(sec) {
  const t = document.getElementById("time");
  clearInterval(timer);
  timer = setInterval(() => {
    sec--;
    if (t) t.textContent = sec;
    if (sec <= 0) {
      clearInterval(timer);
      if (me.id === currentPlayer) {
        socket.emit("endRound", { hits: wordsHit, skips: wordsSkipped });
      }
    }
  }, 1000);
}

function correct() {
  const w = document.getElementById("word").textContent;
  wordsHit.push(w);
  socket.emit("correct");
}

function skip() {
  const w = document.getElementById("word").textContent;
  wordsSkipped.push(w);
  document.getElementById("word").textContent = "Pulando...";
  socket.emit("skip");
}

socket.on("players", (players, points) => {
  me.id = socket.id;
  if (players.find(p => p.id === me.id)?.isAdmin) screen3(players);
});

socket.on("categoryChosen", () => screen3([]));
socket.on("playerChosen", id => {
  if (me.id === id) app.innerHTML = `<button onclick="socket.emit('startRound')">Iniciar</button>`;
});
socket.on("startRound", id => {
  if (me.id === id) screen4a();
  else screen4b();
});
socket.on("newWord", w => {
  const el = document.getElementById("word");
  if (el) el.textContent = w;
});
socket.on("skipping", () => {
  const el = document.getElementById("word");
  if (el) el.textContent = "Pulando...";
});
socket.on("updatePoints", pts => {
  const s = document.getElementById("score");
  if (s) s.textContent = `Equipe 1: ${pts[1]} | Equipe 2: ${pts[2]}`;
});
socket.on("endRound", (results, pts) => {
  screen5(results);
  const s = document.getElementById("score");
  if (s) s.textContent = `Equipe 1: ${pts[1]} | Equipe 2: ${pts[2]}`;
});
socket.on("resetAll", () => screen1());

screen1();
