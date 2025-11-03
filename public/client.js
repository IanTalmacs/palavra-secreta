const socket = io();
let role = null;
let isAdmin = false;
let myId = null;
let selectedCategory = null;
let selectedPlayerId = null;
let categories = [];
let players = [];
const elems = {
  screen1: document.getElementById("screen1"),
  screen2: document.getElementById("screen2"),
  screen3: document.getElementById("screen3"),
  screen4: document.getElementById("screen4"),
  screen5: document.getElementById("screen5"),
  btnVisitante: document.getElementById("btn-visitante"),
  btnAdmin: document.getElementById("btn-admin"),
  btnCategorias: document.getElementById("btn-categorias"),
  btnReset: document.getElementById("btn-reset"),
  score0: document.getElementById("score0"),
  score1: document.getElementById("score1"),
  categoriesDiv: document.getElementById("categories"),
  playersList: document.getElementById("playersList"),
  startRoundBtn: document.getElementById("startRoundBtn"),
  countdown: document.getElementById("countdown"),
  wordDisplay: document.getElementById("wordDisplay"),
  acertouBtn: document.getElementById("acertouBtn"),
  pularBtn: document.getElementById("pularBtn"),
  roundResults: document.getElementById("roundResults"),
  continueBtn: document.getElementById("continueBtn")
};
function showScreen(n){
  elems.screen1.classList.add("hidden");
  elems.screen2.classList.add("hidden");
  elems.screen3.classList.add("hidden");
  elems.screen4.classList.add("hidden");
  elems.screen5.classList.add("hidden");
  if(n===1) elems.screen1.classList.remove("hidden");
  if(n===2) elems.screen2.classList.remove("hidden");
  if(n===3) elems.screen3.classList.remove("hidden");
  if(n===4) elems.screen4.classList.remove("hidden");
  if(n===5) elems.screen5.classList.remove("hidden");
}
showScreen(1);
window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = '';
});
elems.btnVisitante.addEventListener("click", ()=>{
  role = "visitor";
  socket.emit("register", { role: "visitor" });
  showScreen(2);
});
elems.btnAdmin.addEventListener("click", async ()=>{
  const pwd = prompt("Senha de Admin:");
  if(pwd===null) return;
  socket.emit("register", { role: "admin", password: pwd });
});
elems.btnCategorias.addEventListener("click", ()=>{
  if(!isAdmin) return;
  socket.emit("open_categories");
});
elems.btnReset.addEventListener("click", ()=>{
  if(!isAdmin) return;
  socket.emit("reset");
});
document.querySelectorAll(".top-btn").forEach(b=>{
  b.addEventListener("click",(e)=>{
    const action = b.getAttribute("data-action");
    const team = parseInt(b.getAttribute("data-team"));
    if(!action) return;
    if(!isAdmin) return;
    if(action==="inc") socket.emit("score_change",{team,delta:1});
    if(action==="dec") socket.emit("score_change",{team,delta:-1});
  });
});
socket.on("connect", ()=>{
  myId = socket.id;
  socket.emit("get_state");
});
socket.on("register_result", (data)=>{
  if(!data.success){
    alert("Senha incorreta");
    return;
  }
  isAdmin = data.isAdmin;
  role = isAdmin ? "admin" : "visitor";
  if(isAdmin){
    showScreen(3);
  }else{
    showScreen(2);
  }
});
socket.on("state", (s)=>{
  if(s.scores){
    elems.score0.textContent = s.scores[0]||0;
    elems.score1.textContent = s.scores[1]||0;
  }
  categories = s.categories || [];
  renderCategories();
});
socket.on("players_update", (list)=>{
  players = list;
  renderPlayers();
});
socket.on("score_update", (payload)=>{
  elems.score0.textContent = payload.scores[0]||0;
  elems.score1.textContent = payload.scores[1]||0;
});
socket.on("reset_game", ()=>{
  selectedCategory = null;
  selectedPlayerId = null;
  renderCategories();
  renderPlayers();
  showScreen(1);
});
socket.on("show_screen", ({screen})=>{
  if(screen===3 && isAdmin) showScreen(3);
});
socket.on("round_started", ({remaining})=>{
  if(socket.id === myId){
  }
});
socket.on("new_word", ({word})=>{
  elems.wordDisplay.textContent = word;
});
socket.on("round_tick", ({remaining})=>{
  elems.countdown.textContent = remaining;
});
socket.on("puling", ()=>{
  elems.wordDisplay.textContent = "pulando...";
});
socket.on("round_ended", ({words,playerId})=>{
  elems.roundResults.innerHTML = "";
  words.forEach(it=>{
    const div = document.createElement("div");
    div.className = "result-item " + (it.status==="guessed" ? "guessed" : "skipped");
    div.textContent = it.word;
    elems.roundResults.appendChild(div);
  });
  showScreen(5);
});
elems.startRoundBtn.addEventListener("click", ()=>{
  if(!isAdmin) return;
  if(!selectedCategory || !selectedPlayerId) return;
  socket.emit("start_round", { category: selectedCategory, targetId: selectedPlayerId });
});
elems.acertouBtn.addEventListener("click", ()=>{
  socket.emit("acertou");
});
elems.pularBtn.addEventListener("click", ()=>{
  socket.emit("pular");
});
elems.continueBtn.addEventListener("click", ()=>{
  socket.emit("continue_after_round");
  if(isAdmin) showScreen(3); else showScreen(2);
});
socket.on("after_round_continue", ()=>{
  if(isAdmin) showScreen(3); else showScreen(2);
});
function renderCategories(){
  elems.categoriesDiv.innerHTML = "";
  categories.forEach(cat=>{
    const b = document.createElement("button");
    b.className = "chip" + (selectedCategory===cat ? " selected" : "");
    b.textContent = cat;
    b.addEventListener("click", ()=>{
      if(!isAdmin) return;
      if(selectedCategory===cat) selectedCategory = null; else selectedCategory = cat;
      renderCategories();
      updateStartButton();
    });
    elems.categoriesDiv.appendChild(b);
  });
}
function renderPlayers(){
  elems.playersList.innerHTML = "";
  players.forEach(p=>{
    const b = document.createElement("button");
    b.className = "chip" + (selectedPlayerId===p.id ? " selected" : "");
    b.textContent = p.name + (p.isAdmin ? " (Admin)" : "");
    b.addEventListener("click", ()=>{
      if(!isAdmin) return;
      if(selectedPlayerId===p.id) selectedPlayerId = null; else selectedPlayerId = p.id;
      renderPlayers();
      updateStartButton();
    });
    elems.playersList.appendChild(b);
  });
}
function updateStartButton(){
  if(selectedCategory && selectedPlayerId){
    elems.startRoundBtn.classList.remove("hidden");
  }else{
    elems.startRoundBtn.classList.add("hidden");
  }
}
socket.on("connect_error", ()=>{});
socket.on("disconnect", ()=>{});
socket.on("show_screen", (d)=>{ if(d.screen===1) showScreen(1); if(d.screen===2) showScreen(2); if(d.screen===3 && isAdmin) showScreen(3); });
socket.on("round_started", ({remaining})=>{
  if(socket.id === myId) {}
});
socket.on("new_word", ({word})=>{
  elems.wordDisplay.textContent = word;
});
socket.on("round_tick", ({remaining})=>{
  elems.countdown.textContent = remaining;
});
socket.on("round_ended", ({words})=>{
});
socket.on("players_update", (list)=>{
  players = list;
  renderPlayers();
});
socket.on("state", (s)=>{
  if(s.scores){
    elems.score0.textContent = s.scores[0]||0;
    elems.score1.textContent = s.scores[1]||0;
  }
  categories = s.categories || categories;
  renderCategories();
});
