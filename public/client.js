const socket = io();
let nameInput, confirmBtn, app = document.getElementById("app");
let myId, admin = false, myTeam, currentWord, timer, results = [];

window.onbeforeunload = () => "Tem certeza que deseja sair?";

function screen1() {
  app.innerHTML = `
    <input id="name" placeholder="Seu nome">
    <button id="confirm">Confirmar</button>
    <div class="section"><h3>Lobby</h3><div id="lobbyList"></div></div>
    <div class="section"><h3>Equipe 1</h3><div id="team1"></div></div>
    <div class="section"><h3>Equipe 2</h3><div id="team2"></div></div>
    <button id="btnCat" style="display:none">Categorias</button>
  `;
  document.getElementById("confirm").onclick = () => {
    const name = document.getElementById("name").value.trim();
    if (!name) return;
    socket.emit("join", name);
    myId = socket.id;
  };
  document.getElementById("btnCat").onclick = () => socket.emit("goCategories");
}

function screen2(scores) {
  app.innerHTML = `<div class="big">Placar<br>Equipe 1: ${scores.team1} | Equipe 2: ${scores.team2}</div>
  <div id="cats"></div>`;
  const cats = ["animais","tv e cinema","objetos","lugares","pessoas","esportes e jogos","profissões","alimentos","personagens","bíblico"];
  cats.forEach(c=>{
    const b=document.createElement("button");
    b.textContent=c;
    if(admin) b.onclick=()=>socket.emit("chooseCategory",c);
    document.getElementById("cats").appendChild(b);
  });
}

function screen3(players, teams, pid) {
  app.innerHTML = `<div class="section"><h3>Equipe 1</h3>${teams.team1.map(p=>`<div data-id="${p.id}" class="player">${p.name}</div>`).join("")}</div>
  <div class="section"><h3>Equipe 2</h3>${teams.team2.map(p=>`<div data-id="${p.id}" class="player">${p.name}</div>`).join("")}</div>`;
  if(admin) document.querySelectorAll(".player").forEach(p=>{
    p.onclick=()=>socket.emit("choosePlayer",p.dataset.id);
  });
}

function screen4a(team) {
  app.innerHTML = `<div class="big" id="time"></div><div class="big" id="word"></div>
  <button id="ok">Acertou</button><button id="skip">Pular</button>`;
  socket.emit("getWord");
  socket.on("newWord", w=>{
    currentWord=w;
    document.getElementById("word").textContent=w;
  });
  socket.on("noWords", ()=>document.getElementById("word").textContent="Sem mais palavras!");
  let t=75; document.getElementById("time").textContent=t;
  timer=setInterval(()=>{
    t--; document.getElementById("time").textContent=t;
    if(t<=5) document.getElementById("skip").style.display="none";
    if(t<=0){clearInterval(timer);socket.emit("endRound",results);}
  },1000);
  document.getElementById("ok").onclick=()=>{
    socket.emit("correct",team);
    results.push({word:currentWord,ok:true});
    socket.emit("getWord");
  };
  document.getElementById("skip").onclick=()=>{
    results.push({word:currentWord,ok:false});
    document.getElementById("word").textContent="Pulando...";
    document.getElementById("ok").style.display="none";
    document.getElementById("skip").style.display="none";
    setTimeout(()=>{
      document.getElementById("ok").style.display="";
      document.getElementById("skip").style.display="";
      socket.emit("getWord");
    },3000);
  };
}

function screen4b() {
  app.innerHTML = `<div class="big" id="time"></div>`;
  let t=75; document.getElementById("time").textContent=t;
  timer=setInterval(()=>{
    t--; document.getElementById("time").textContent=t;
    if(t<=0){clearInterval(timer);}
  },1000);
}

function screen5(r,scores) {
  app.innerHTML = r.map(x=>`<div class="${x.ok?'green':'red'}">${x.word}</div>`).join("")+
  `<div class="big">Equipe 1: ${scores.team1} | Equipe 2: ${scores.team2}</div>
  <button id="backCat" ${admin?"":"disabled"}>Categorias</button>`;
  document.getElementById("backCat").onclick=()=>socket.emit("backToCategories");
}

socket.on("updatePlayers",(players,teams,screen,cat,pid,scores)=>{
  if(!myId) myId=socket.id;
  admin = socket.id===Object.keys(players).find(id=>players[id].name && players[id].name===players[Object.keys(players)[0]].name && id===socket.id && players[id].name.includes);
  document.getElementById("btnCat")?.style.setProperty("display", socket.id===Object.keys(players).find(id=>players[id].name && players[id].name.includes("999"))?"block":"none");
  const lobbyList=document.getElementById("lobbyList");
  if(lobbyList){
    lobbyList.innerHTML="";
    Object.values(players).forEach(p=>{
      if(p.team==="lobby"){
        const div=document.createElement("div");
        div.textContent=p.name;
        if(socket.id===Object.keys(players).find(id=>players[id].name && players[id].name.includes("999"))){
          div.onclick=()=>socket.emit("movePlayer",{playerId:p.id,team:"team1"});
        }
        lobbyList.appendChild(div);
      }
    });
    document.getElementById("team1").innerHTML=teams.team1.map(p=>`<div>${p.name}</div>`).join("");
    document.getElementById("team2").innerHTML=teams.team2.map(p=>`<div>${p.name}</div>`).join("");
  }
});

socket.on("updateScreen",(s,c)=>{
  if(s===1) screen1();
  if(s===2) screen2({team1:0,team2:0});
  if(s===3) screen3();
});

socket.on("choosePlayer",(pid)=>{
  screen3();
  if(myId===pid) app.innerHTML+=`<button id="start">Iniciar</button>`;
  document.getElementById("start")?.addEventListener("click",()=>socket.emit("startRound"));
});

socket.on("startRound",(pid)=>{
  const myTeam = Object.entries({team1:[],team2:[]}).find(([t,v])=>v.some(p=>p.id===pid));
  if(myId===pid) screen4a(myTeam?myTeam[0]:"team1");
  else screen4b();
});

socket.on("endRound",(r,s)=>screen5(r,s));
socket.on("resetAll",()=>screen1());

screen1();
