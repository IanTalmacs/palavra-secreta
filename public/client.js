const socket = io();
let myId = null;
let myName = "";
let isAdmin = false;
let selectedCategory = null;
let selectedPlayer = null;
let selectedTeam = null;
let availableSelection = {};
const categories = [
  { key: "animais", label: "Animais" },
  { key: "tv_e_cinema", label: "TV e Cinema" },
  { key: "objetos", label: "Objetos" },
  { key: "lugares", label: "Lugares" },
  { key: "pessoas", label: "Pessoas" },
  { key: "esportes_e_jogos", label: "Esportes e Jogos" },
  { key: "profissoes", label: "Profissões" },
  { key: "alimentos", label: "Alimentos" },
  { key: "personagens", label: "Personagens" },
  { key: "biblico", label: "Bíblico" }
];
const el = id => document.getElementById(id);
function show(elm, v) { if (v) elm.classList.remove("hidden"); else elm.classList.add("hidden"); }
function createBtn(text, cls = "catBtn") { const b = document.createElement("button"); b.className = cls; b.innerText = text; return b; }
el("confirmName").addEventListener("click", () => {
  const name = el("nameInput").value.trim() || "Visitante";
  myName = name;
  socket.emit("join", name);
  show(el("initialScreen"), false);
  show(el("gameScreen"), true);
  show(el("categoriesSection"), true);
  show(el("topSection"), true);
  show(el("roundSection"), false);
  show(el("verificationSection"), false);
  show(el("roleButtons"), true);
});
el("visitorBtn").addEventListener("click", () => {
  socket.emit("setPlayerTeam", { teamKey: null });
  show(el("adminPanel"), false);
  show(el("roleButtons"), false);
});
el("adminBtn").addEventListener("click", () => {
  show(el("adminPanel"), true);
  show(el("roleButtons"), false);
});
el("adminLogin").addEventListener("click", () => {
  const pw = el("adminPw").value || "";
  socket.emit("becomeAdmin", pw);
});
el("startGameBtn").addEventListener("click", () => {
  const tA = el("teamAName").value.trim() || "Equipe A";
  const tB = el("teamBName").value.trim() || "Equipe B";
  socket.emit("setTeamNames", { teamA: tA, teamB: tB });
  socket.emit("startGame");
});
el("resetBtn").addEventListener("click", () => {
  socket.emit("reset");
});
el("startRoundBtn").addEventListener("click", () => {
  if (!selectedCategory || !selectedPlayer || !selectedTeam) return;
  socket.emit("startRound", { playerId: selectedPlayer, category: selectedCategory, teamKey: selectedTeam });
});
el("acertouBtn").addEventListener("click", () => {
  socket.emit("acertou");
});
el("pularBtn").addEventListener("click", () => {
  socket.emit("pular");
});
el("continueBtn").addEventListener("click", () => {
  socket.emit("continue");
});
window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = "";
});
socket.on("connect", () => {
  myId = socket.id;
});
socket.on("players", list => {
  const wrap = el("playersList");
  wrap.innerHTML = "";
  list.forEach(p => {
    const b = createBtn(p.name, "playerBtn");
    if (p.id === selectedPlayer) b.classList.add("selected");
    b.addEventListener("click", () => {
      if (!isAdmin) return;
      selectedPlayer = p.id;
      updateSelectionsUI();
      socket.emit("selectPlayerTeamCategory", { selectedPlayer, selectedCategory, selectedTeam });
    });
    wrap.appendChild(b);
  });
  if (list.length === 0) return;
});
socket.on("teams", t => {
  const wrap = el("teamsList");
  wrap.innerHTML = "";
  const aBtn = createBtn(t.a.name, "teamBtn");
  const bBtn = createBtn(t.b.name, "teamBtn");
  if (selectedTeam === "a") aBtn.classList.add("selected");
  if (selectedTeam === "b") bBtn.classList.add("selected");
  aBtn.addEventListener("click", () => {
    if (!isAdmin) return;
    selectedTeam = "a";
    updateSelectionsUI();
    socket.emit("selectPlayerTeamCategory", { selectedPlayer, selectedCategory, selectedTeam });
  });
  bBtn.addEventListener("click", () => {
    if (!isAdmin) return;
    selectedTeam = "b";
    updateSelectionsUI();
    socket.emit("selectPlayerTeamCategory", { selectedPlayer, selectedCategory, selectedTeam });
  });
  wrap.appendChild(aBtn);
  wrap.appendChild(bBtn);
  el("scoreA").querySelector(".teamName").innerText = t.a.name;
  el("scoreB").querySelector(".teamName").innerText = t.b.name;
  el("scoreA").querySelector(".teamScore").innerText = t.a.score;
  el("scoreB").querySelector(".teamScore").innerText = t.b.score;
});
function buildCategories() {
  const wrap = el("categoriesButtons");
  wrap.innerHTML = "";
  categories.forEach(cat => {
    const b = createBtn(cat.label, "catBtn");
    b.addEventListener("click", () => {
      if (!isAdmin) return;
      if (selectedCategory === cat.key) selectedCategory = null; else selectedCategory = cat.key;
      updateSelectionsUI();
      socket.emit("selectPlayerTeamCategory", { selectedPlayer, selectedCategory, selectedTeam });
    });
    wrap.appendChild(b);
  });
}
buildCategories();
function updateSelectionsUI() {
  document.querySelectorAll(".catBtn").forEach((b, i) => {
    const key = categories[i].key;
    if (selectedCategory === key) b.classList.add("selected"); else b.classList.remove("selected");
  });
  document.querySelectorAll(".playerBtn").forEach(b => {
    b.classList.remove("selected");
    if (b.innerText === "") return;
  });
  document.querySelectorAll(".playerBtn").forEach(b => {
    const txt = b.innerText;
    if (!txt) return;
    if (selectedPlayer) {
      const elPlayer = Array.from(document.querySelectorAll(".playerBtn")).find(x => x.innerText === txt);
      if (elPlayer) {
        if (elPlayer && selectedPlayer) {
          if (elPlayer && elPlayer._id === selectedPlayer) elPlayer.classList.add("selected");
        }
      }
    }
  });
  document.querySelectorAll(".teamBtn").forEach((b, i) => {
    const key = i === 0 ? "a" : "b";
    if (selectedTeam === key) b.classList.add("selected"); else b.classList.remove("selected");
  });
  if (selectedCategory && selectedPlayer && selectedTeam && isAdmin) show(el("startRoundWrapper"), true); else show(el("startRoundWrapper"), false);
}
socket.on("adminResult", res => {
  if (res.ok) {
    isAdmin = true;
    show(el("adminPanel"), true);
    show(el("teamNaming"), true);
    show(el("adminError"), false);
    show(el("resetBtn"), true);
  } else {
    el("adminError").innerText = res.message || "Erro";
    show(el("adminError"), true);
  }
});
socket.on("gameStarted", () => {
  show(el("initialScreen"), false);
  show(el("gameScreen"), true);
});
socket.on("selection", sel => {
  availableSelection = sel;
});
socket.on("roundStarted", data => {
  show(el("categoriesSection"), false);
  show(el("roundSection"), true);
  if (data.playerId === myId) {
    show(el("roundSection"), true);
  }
});
socket.on("categoriesVisible", v => {
  if (v) {
    show(el("categoriesSection"), true);
    show(el("roundSection"), false);
  } else {
    show(el("categoriesSection"), false);
  }
});
socket.on("newWord", d => {
  if (d.for === myId) {
    el("wordDisplay").innerText = d.word || "—";
    show(el("skipping"), false);
  }
});
socket.on("tick", rem => {
  el("timerDisplay").innerText = rem;
});
socket.on("skipping", d => {
  if (d.for === myId) {
    show(el("skipping"), true);
    el("wordDisplay").innerText = "";
  }
});
socket.on("roundEnded", payload => {
  show(el("roundSection"), false);
  show(el("verificationSection"), true);
  const corr = el("correctList");
  const sk = el("skippedList");
  corr.innerHTML = "";
  sk.innerHTML = "";
  payload.correct.forEach(w => {
    const div = document.createElement("div");
    div.className = "wordItem correct";
    div.innerText = w;
    corr.appendChild(div);
  });
  payload.skipped.forEach(w => {
    const div = document.createElement("div");
    div.className = "wordItem skipped";
    div.innerText = w;
    sk.appendChild(div);
  });
  el("scoreA").querySelector(".teamScore").innerText = payload.teams.a.score;
  el("scoreB").querySelector(".teamScore").innerText = payload.teams.b.score;
  if (isAdmin) show(el("continueBtn"), true); else show(el("continueBtn"), false);
});
socket.on("verificationHidden", () => {
  show(el("verificationSection"), false);
});
socket.on("reset", () => {
  location.reload();
});
socket.on("adminAssigned", id => {
  if (id === myId) {
    isAdmin = true;
    show(el("resetBtn"), true);
  }
});
socket.on("gameState", s => {
  if (s && s.adminId && s.adminId === myId) {
    isAdmin = true;
    show(el("resetBtn"), true);
  }
});
socket.on("connect_error", () => {});
