const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "../client")));
app.use(express.json({ limit: "20mb" }));

app.get("/map-editor", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/map-editor.html"));
});

const mapsDir = path.join(__dirname, "maps");
if (!fs.existsSync(mapsDir)) {
    fs.mkdirSync(mapsDir);
}

app.get("/api/maps", (req, res) => {
    fs.readdir(mapsDir, (err, files) => {
        if (err) return res.status(500).json({ error: "Failed to read maps directory." });
        const mapFiles = files.filter(f => f.endsWith('.json'));
        res.json(mapFiles);
    });
});

app.get("/api/maps/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(mapsDir, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Map not found" });
    }
    fs.readFile(filePath, "utf8", (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read map" });
        res.json(JSON.parse(data));
    });
});

app.delete("/api/maps/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(mapsDir, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Map not found" });
    }
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: "Failed to delete map" });
        res.json({ success: true });
    });
});

app.post("/api/maps", (req, res) => {
    const mapData = req.body;
    let filename = req.query.filename || `map_${Date.now()}.json`;
    
    // Basic security: prevent path traversal
    filename = path.basename(filename);
    if (!filename.endsWith('.json')) filename += '.json';

    fs.writeFile(path.join(mapsDir, filename), JSON.stringify(mapData, null, 2), (err) => {
        if (err) return res.status(500).json({ error: "Failed to save map." });
        res.json({ success: true, filename });
    });
});

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
                selectedMapId: "default",
                readyPlayers: new Set(),
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
            duration: room.duration,
            selectedMapId: room.selectedMapId
        });
    });

    socket.on("updateSettings", ({ duration, mapId }) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        // Hanya host yang bisa ganti (cek socket.id == rooms[currentRoom].players[0].id)
        if (room.players[0] && room.players[0].id === socket.id) {
            if (duration !== undefined) room.duration = duration;
            if (mapId !== undefined) room.selectedMapId = mapId;
            socket.to(currentRoom).emit("settingsUpdated", { duration: room.duration, mapId: room.selectedMapId });
        }
    });

    socket.on("startGame", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        const room = rooms[currentRoom];
        if (room.gameStarted) return;
        
        // Hanya host yang bisa start
        if (room.players[0] && room.players[0].id !== socket.id) return;
        
        room.gameStarted = true;
        room.readyPlayers.clear();
        
        // Notify all players that match is preparing (for loading screen)
        io.to(currentRoom).emit("matchPreparing");
        
        const players = room.players;
        
        // 1. Read selected map Data FIRST to determine spawn points
        let mapData = null;
        if (room.selectedMapId && room.selectedMapId !== "default") {
            try {
                const mapPath = path.join(mapsDir, room.selectedMapId);
                if (fs.existsSync(mapPath)) {
                    const rawData = fs.readFileSync(mapPath);
                    mapData = JSON.parse(rawData);
                }
            } catch (err) {
                console.error("Failed to read map file for spawning:", err);
            }
        }

        const arenaWidth = mapData ? (mapData.width || 1800) : 1800;
        const arenaHeight = mapData ? (mapData.height || 900) : 900;

        // 2. Determine Spawn Points (Custom or dynamic fallback)
        let spawnPoints = [];
        if (mapData && mapData.playerSpawns && mapData.playerSpawns.length > 0) {
            spawnPoints = mapData.playerSpawns;
        } else {
            // Fallback: Logic-based spawning inside map bounds
            spawnPoints = [
                { x: 100, y: 100 },
                { x: arenaWidth - 100, y: arenaHeight - 100 },
                { x: arenaWidth - 100, y: 100 },
                { x: 100, y: arenaHeight - 100 },
                { x: arenaWidth / 2, y: 100 },
                { x: arenaWidth / 2, y: arenaHeight - 100 },
                { x: 100, y: arenaHeight / 2 },
                { x: arenaWidth - 100, y: arenaHeight / 2 }
            ];
        }
        
        // 3. Assign positions and teams
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        const shuffledSpawns = [...spawnPoints].sort(() => Math.random() - 0.5);
        
        const startPositions = {};
        shuffledPlayers.forEach((p, i) => {
            p.team = i; // Unique team ID for FFA
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
            duration: room.duration,
            mapData: mapData
        });
        
        console.log(`Room ${currentRoom} preparing with ${players.length} players, duration: ${room.duration}s, map: ${room.selectedMapId}`);
    });

    socket.on("playerReadyToStart", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        
        room.readyPlayers.add(socket.id);
        
        // Broadcast who is ready to all
        io.to(currentRoom).emit("matchLoadingUpdate", {
            readyPlayerIds: Array.from(room.readyPlayers)
        });

        // Check if everyone is ready
        const allInLobbyIds = room.players.map(p => p.id);
        const allReady = allInLobbyIds.every(id => room.readyPlayers.has(id));

        if (allReady) {
            io.to(currentRoom).emit("matchStartFinal");
            console.log(`Room ${currentRoom} match started for real! Everyone is ready.`);
        }
    });

    socket.on("returnLobby", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        const room = rooms[currentRoom];
        
        // Allow anyone to trigger return to lobby (Co-op/FFA focus)
        // This prevents guests from getting stuck if the host is AFK after a match
        room.gameStarted = false;
        io.to(currentRoom).emit("returnToLobby");
        console.log(`Room ${currentRoom} returned to lobby by ${socket.id}.`);
    });

    socket.on("sync", (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit("sync", data);
    });

    socket.on("syncTo", ({ target, data }) => {
        io.to(target).emit("sync", data);
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
                io.to(currentRoom).emit("playerDisconnected", socket.id);
                io.to(currentRoom).emit("lobbyUpdate", {
                    players: room.players,
                    duration: room.duration,
                    selectedMapId: room.selectedMapId
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