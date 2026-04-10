const queues = {
    "1v1": [],
    "2v2": [],
    "4v4": []
};

function addToQueue(socket, mode, io) {
    if (!queues[mode]) queues[mode] = [];

    queues[mode].push(socket);

    console.log(`Player ${socket.id} join ${mode}`);

    const neededPlayers = mode === "2v2" ? 4 : (mode === "4v4" ? 8 : 2);

    if (queues[mode].length >= neededPlayers) {
        const players = queues[mode].splice(0, neededPlayers);

        const roomId = "room_" + Date.now();

        players.forEach((s) => {
            s.join(roomId);
        });

        const spawns = [
            { x: 100, y: 100 },
            { x: 600, y: 400 },
            { x: 100, y: 400 },
            { x: 600, y: 100 }
        ];
        const startPositions = {};
        players.forEach((s, i) => {
            startPositions[s.id] = spawns[i % spawns.length];
        });

        io.to(roomId).emit("matchFound", {
            roomId,
            players: players.map(p => p.id),
            startPositions
        });

        console.log(`Room created: ${roomId}`);
    }
}

module.exports = { addToQueue };