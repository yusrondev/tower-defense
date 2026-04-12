import { createPeerConnection, getPeers } from "./webrtc.js";
import { setLocalSpawn, setPlayerColor, handleRemoteInput, removeRemotePlayer, stopGame } from "../game/gameLoop.js";

let socket;

export function connectSocket() {
  return new Promise((resolve) => {
    socket = window.io();

    socket.on("connect", () => {
      console.log("Connected:", socket.id);
      resolve();
    });

    socket.on("pong", (startTime) => {
      const latency = Date.now() - startTime;
      const pingEl = document.getElementById("ping-value");
      if (pingEl) {
        pingEl.innerText = latency;
      }
    });

    socket.on("sync", (data) => {
      try {
        const parsed = JSON.parse(data);
        if (!parsed) return;
        handleRemoteInput(parsed.id, parsed.input, parsed.state);
      } catch (err) {
        console.error("Socket Sync Parse Error:", err, data);
      }
    });

    socket.on("playerDisconnected", (id) => {
      removeRemotePlayer(id);
    });

    socket.on("matchFound", async (data) => {
      console.log("Match Found!", data);

      const { players, startPositions } = data;
      
      // Reset peers sebelum koneksi jika ada sisa koneksi gagal
      for(let key in getPeers()) {
         try { getPeers()[key].pc.close(); } catch(e){}
         delete getPeers()[key];
      }

      if (startPositions && startPositions[socket.id]) {
        setLocalSpawn(startPositions[socket.id].x, startPositions[socket.id].y);
      }

      // Cari dan set warna lokal
      const me = players.find(p => p.id === socket.id);
      if (me) {
        setPlayerColor(me.color);
      }

      for (let pObj of players) {
        const id = pObj.id;
        if (id === socket.id) continue;

        const isInitiator = socket.id < id;

        const pc = createPeerConnection(socket, id, isInitiator);

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("offer", {
            target: id,
            offer
          });
        }
      }
    });

    socket.on("offer", async ({ from, offer }) => {
      let pc;
      if (!getPeers()[from]) {
        pc = createPeerConnection(socket, from, false);
      } else {
        pc = getPeers()[from].pc;
      }

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", {
        target: from,
        answer
      });
    });

    socket.on("answer", async ({ from, answer }) => {
      const pc = getPeers()[from].pc;
      await pc.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      if (!getPeers()[from]) {
         createPeerConnection(socket, from, false); // prepare if offer is late
      }
      const pc = getPeers()[from].pc;
      try {
         await pc.addIceCandidate(candidate);
      } catch(e) {
         console.log("Failed to add ICE candidate because remote description might be pending:", e);
         // in a perfectly robust app we should queue this, but mostly STUN trickle survives drop or recovers
      }
    });
  });
}

export function getMyId() {
  return socket.id;
}

export function onMatchFound(callback) {
  socket.on("matchFound", (data) => {
    console.log("Match Found!", data);
    callback(data);
  });
}

export function onMatchPreparing(callback) {
  if (socket) socket.on("matchPreparing", callback);
}

export function joinRoom(roomId, playerName, role) {
  socket.emit("joinRoom", { roomId, playerName, role });
}

export function updateSettings(duration, mapId) {
  socket.emit("updateSettings", { duration, mapId });
}

export function changeRole(role) {
  if (socket) socket.emit("changeRole", role);
}

export function onSettingsUpdated(callback) {
  socket.on("settingsUpdated", callback);
}

export function requestStartGame() {
  socket.emit("startGame");
}

export function sendSync(dataStr) {
  if (socket) socket.emit("sync", dataStr);
}

export function sendSyncTo(target, dataStr) {
  if (socket) socket.emit("syncTo", { target, dataStr });
}

export function onLobbyUpdate(callback) {
  socket.on("lobbyUpdate", callback);
}

export function requestReturnLobby() {
  socket.emit("returnLobby");
}

export function onReturnToLobby(callback) {
  socket.on("returnToLobby", callback);
}

export function emitPlayerReady() {
  if (socket) socket.emit("playerReadyToStart");
}

export function onMatchLoadingUpdate(callback) {
  if (socket) socket.on("matchLoadingUpdate", callback);
}

export function onMatchStartFinal(callback) {
  if (socket) socket.on("matchStartFinal", callback);
}

// LATENCY MEASUREMENT (PING)
setInterval(() => {
  if (socket && socket.connected) {
    socket.emit("ping", Date.now());
  }
}, 2000);