const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "../client")));

const io = new Server(server, {
    cors: { origin: "*" }
});

const rooms = {};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    let currentRoom = null;

    socket.on("joinRoom", ({ roomId, playerName, role }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [], // List of { id, color, name, isHost }
                gameStarted: false,
                duration: 60, // Default 1 min
                availableColors: ["#3498db", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#ecf0f1", "#1abc9c"]
            };
        }
        
        const room = rooms[roomId];
        
        // Cek kalau udah pernah join
        if (!room.players.find(p => p.id === socket.id)) {
             const color = room.availableColors.shift() || "#ffffff"; // Ambil warna dari pool
             const isHost = room.players.length === 0;
             room.players.push({ 
                 id: socket.id, 
                 color: color, 
                 name: playerName || `Player ${room.players.length + 1}`,
                 isHost: isHost,
                 role: role || "damager"
             });
        }
        
        currentRoom = roomId;
        socket.join(roomId);
        
        io.to(roomId).emit("lobbyUpdate", {
            players: room.players,
            duration: room.duration
        });
    });

    socket.on("updateSettings", ({ duration }) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        // Hanya host yang bisa ganti (cek socket.id == rooms[currentRoom].players[0].id)
        if (room.players[0] && room.players[0].id === socket.id) {
            room.duration = duration;
            socket.to(currentRoom).emit("settingsUpdated", { duration });
        }
    });

    socket.on("startGame", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        const room = rooms[currentRoom];
        if (room.gameStarted) return;
        
        // Hanya host yang bisa start
        if (room.players[0] && room.players[0].id !== socket.id) return;
        
        room.gameStarted = true;
        
        const players = room.players;
        
        // Titik Spawn di ujung-ujung map (Corner & Edges) agar tidak menempel
        const spawnPoints = [
            { x: 100, y: 100 },   // Pojok Kiri Atas
            { x: 1100, y: 1100 }, // Pojok Kanan Bawah
            { x: 1100, y: 100 },  // Pojok Kanan Atas
            { x: 100, y: 1100 },  // Pojok Kiri Bawah
            { x: 600, y: 100 },   // Tengah Atas
            { x: 600, y: 1100 },  // Tengah Bawah
            { x: 100, y: 850 },   // Jauh dari Base Tower
            { x: 1100, y: 400 }   // Jauh dari Front Tower
        ];
        
        // Acak urutan pemain dan urutan spawn
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        const shuffledSpawns = [...spawnPoints].sort(() => Math.random() - 0.5);
        
        const startPositions = {};
        shuffledPlayers.forEach((p, i) => {
            p.team = i; // Berikan ID unik sebagai "tim" agar semua musuh (No Team)
            const spawn = shuffledSpawns[i % shuffledSpawns.length];
            startPositions[p.id] = {
                x: spawn.x,
                y: spawn.y
            };
        });

        io.to(currentRoom).emit("matchFound", {
            roomId: currentRoom,
            players: shuffledPlayers,
            startPositions,
            duration: room.duration
        });
        
        console.log(`Room ${currentRoom} started with ${players.length} players, duration: ${room.duration}s`);
    });

    socket.on("sync", (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit("sync", data);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const color = room.players[playerIndex].color;
                room.availableColors.push(color); // Kembalikan warna ke pool
                room.players.splice(playerIndex, 1);
            }

            if (room.players.length === 0) {
                delete rooms[currentRoom];
            } else {
                // Berikan status host ke pemain berikutnya jika host diskonek
                if (!room.players.find(p => p.isHost)) {
                    room.players[0].isHost = true;
                }
                io.to(currentRoom).emit("lobbyUpdate", {
                    players: room.players,
                    duration: room.duration
                });
            }
        }
    });

    socket.on("offer", ({ target, offer }) => {
        io.to(target).emit("offer", {
            from: socket.id,
            offer
        });
    });

    socket.on("answer", ({ target, answer }) => {
        io.to(target).emit("answer", {
            from: socket.id,
            answer
        });
    });

    socket.on("ice-candidate", ({ target, candidate }) => {
        io.to(target).emit("ice-candidate", {
            from: socket.id,
            candidate
        });
    });

    socket.on("ping", (data) => {
        socket.emit("pong", data);
    });
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});