const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

let players = {};
let teams = {1: [], 2: []};
let adminId = null;
let wordsUsed = [];
let currentWord = '';
let roundActive = false;
let category = '';
let scores = {1: 0, 2: 0};

const words = JSON.parse(fs.readFileSync(__dirname + '/public/words.json', 'utf8'));

io.on('connection', socket => {
    socket.on('setName', name => {
        players[socket.id] = {name, team: null};
        if (name.toLowerCase().includes('admin')) {
            adminId = socket.id;
            socket.emit('isAdmin');
        }
        io.emit('updatePlayers', players, teams, scores);
    });

    socket.on('joinTeam', team => {
        if (players[socket.id]) {
            if (players[socket.id].team) {
                teams[players[socket.id].team] = teams[players[socket.id].team].filter(id => id !== socket.id);
            }
            players[socket.id].team = team;
            teams[team].push(socket.id);
            io.emit('updatePlayers', players, teams, scores);
        }
    });

    socket.on('setCategory', cat => {
        if (socket.id === adminId) {
            category = cat;
            io.emit('categorySelected', category);
        }
    });

    socket.on('startRound', ({selectedPlayer}) => {
        if (socket.id === adminId && players[selectedPlayer]) {
            roundActive = true;
            wordsUsed = [];
            io.emit('roundStarted', selectedPlayer);
            nextWord(selectedPlayer);
        }
    });

    socket.on('correct', playerId => {
        if (!roundActive) return;
        const team = players[playerId].team;
        scores[team]++;
        io.emit('updateScores', scores);
        nextWord(playerId);
    });

    socket.on('skip', playerId => {
        if (!roundActive) return;
        io.to(playerId).emit('skipping');
        setTimeout(() => nextWord(playerId), 3000);
    });

    socket.on('endRound', () => {
        roundActive = false;
        io.emit('roundEnded');
    });

    socket.on('disconnect', () => {
        if (socket.id === adminId) {
            players = {};
            teams = {1: [], 2: []};
            adminId = null;
            scores = {1: 0, 2: 0};
            io.emit('reset');
        } else {
            const team = players[socket.id]?.team;
            if (team) {
                teams[team] = teams[team].filter(id => id !== socket.id);
            }
            delete players[socket.id];
            io.emit('updatePlayers', players, teams, scores);
        }
    });

    function nextWord(playerId) {
        const availableWords = words[category].filter(w => !wordsUsed.includes(w));
        if (availableWords.length === 0) {
            io.emit('roundEnded');
            roundActive = false;
            return;
        }
        currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
        wordsUsed.push(currentWord);
        io.to(playerId).emit('showWord', currentWord);
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

