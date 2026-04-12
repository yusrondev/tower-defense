import { connectSocket, joinRoom, requestStartGame, updateSettings, onSettingsUpdated, onLobbyUpdate, onMatchFound, getMyId, requestReturnLobby, onReturnToLobby, emitPlayerReady, onMatchLoadingUpdate, onMatchStartFinal, onMatchPreparing, changeRole } from "./network/socket.js";
import { initGameConfig, startGame, stopGame, syncLobbyState } from "./game/gameLoop.js";

await connectSocket();

// --- UI Elements ---
const joinBtn = document.getElementById("join-room-btn");
const roomInput = document.getElementById("room-id-input");
const playerNameInput = document.getElementById("player-name-input");
const lobbyMenu = document.getElementById("lobby-menu");
const lobbySetup = document.getElementById("lobby-setup");
const playersContainer = document.getElementById("players-container");
const gameContainer = document.getElementById("game-container");
const lobbyStatus = document.getElementById("lobby-status");

// Corner Buttons
const spellInfoBtn = document.getElementById("spell-info-btn");
const changeRoleBtn = document.getElementById("change-role-btn");
const hostMapBtn = document.getElementById("host-map-btn");
const startBtn = document.getElementById("start-game-btn");
const guestMapInfo = document.getElementById("guest-map-info");

// Modals
const roleModal = document.getElementById("role-modal");
const mapModal = document.getElementById("map-modal");
const spellModal = document.getElementById("spell-modal");

let selectedRole = "damager";
let isMapLoading = false;
let currentLobbyPlayers = [];

// --- Generic Toast System ---
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const titles = { success: "Berhasil", error: "Error", warning: "Perhatian", info: "Info" };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type] || titles.info}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <div class="toast-progress">
      <div class="toast-progress-bar" style="animation: progress 3s linear forwards"></div>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add("active"), 10);
  setTimeout(() => {
    toast.classList.remove("active");
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// --- Modal Management ---
function openModal(modal) {
  if (!modal) return;
  modal.classList.add("active");
  // If map modal, update layout
  if (modal === mapModal) {
    refreshMapListModal();
  }
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("active");
}

document.querySelectorAll(".modal-close").forEach(btn => {
  btn.addEventListener("click", (e) => {
    closeModal(e.target.closest(".modal-overlay"));
  });
});

// Close modal on outside click
window.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    closeModal(e.target);
  }
});

// --- Role Selection Logic ---
changeRoleBtn.addEventListener("click", () => openModal(roleModal));

document.querySelectorAll(".role-option").forEach(opt => {
  opt.addEventListener("click", () => {
    const role = opt.getAttribute("data-role");
    selectedRole = role;
    // Update local UI state
    document.querySelectorAll(".role-option").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    
    // If already in room, sync it
    if (currentLobbyPlayers.length > 0) {
      changeRole(role);
      closeModal(roleModal);
      // showToast(`Role diganti ke ${role.toUpperCase()}`, "success");
    }
  });
});

// --- Spell info logic ---
spellInfoBtn.addEventListener("click", () => openModal(spellModal));

// --- Map selection logic ---
hostMapBtn.addEventListener("click", () => openModal(mapModal));

const battleDurationSelect = document.getElementById("battle-duration");
const saveMapSettingsBtn = document.getElementById("save-map-settings");

saveMapSettingsBtn.addEventListener("click", () => {
    const selectedMapId = document.querySelector(".map-card.active")?.getAttribute("data-id");
    if (selectedMapId) {
        updateSettings(battleDurationSelect.value, selectedMapId);
        closeModal(mapModal);
        // showToast("Pengaturan disimpan!", "success");
    } else {
        // showToast("Pilih map terlebih dahulu!", "warning");
    }
});

// --- Room Join Logic ---
joinBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  const playerName = document.getElementById("player-name-input").value.trim();
  
  if (!playerName || playerName.length < 3) {
    showToast("Nama minimal 3 karakter!", "warning");
    return;
  }

  if (!roomId) {
    showToast("ID Room harus diisi!", "warning");
    return;
  }

  joinRoom(roomId, playerName, selectedRole);

  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch (e) { }

  window.dispatchEvent(new Event("resize"));
});

// --- Global Lobby State ---
let lastSelectedMapId = null;

// --- Lobby Updates ---
onLobbyUpdate(async ({ players, duration, selectedMapId }) => {
  currentLobbyPlayers = players;
  lastSelectedMapId = selectedMapId;
  syncLobbyState(players);

  // Transition UI if just joined
  lobbySetup.style.display = "none";
  playersContainer.style.display = "flex";
  spellInfoBtn.style.display = "flex";
  changeRoleBtn.style.display = "flex";

  const me = players.find(p => p.id === getMyId());
  const isHost = me && me.isHost;

  // Render horizontal cards
  playersContainer.innerHTML = players.map(p => `
    <div class="player-card ${p.id === getMyId() ? 'local-player' : ''}">
      ${p.isHost ? '<div class="host-tag">HOST</div>' : ''}
      <div class="player-color-indicator" style="color: ${p.color}; background: ${p.color};"></div>
      <img src="src/skills/ultimatum-${p.role}.png" class="role-icon-lg" />
      <div class="role-badge" style="background: ${getRoleColor(p.role)}">${p.role}</div>
      <div class="player-name">${p.name} ${p.id === getMyId() ? '' : ''}</div>
    </div>
  `).join("");

  // Update Host/Guest Grouped Info
  const mapDisplayName = (selectedMapId && selectedMapId !== "default" && selectedMapId !== "default.json") 
    ? selectedMapId.replace(".json", "").replace(/[-_]/g, " ").toUpperCase() 
    : "ARENA STARDUST";
    
  guestMapInfo.style.display = "flex"; // Always show for both
  document.getElementById("map-name-display").innerText = `MAP: ${mapDisplayName}`;
  document.getElementById("duration-display").innerText = `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2, '0')}`;

  if (isHost) {
    hostMapBtn.style.display = "flex";
    startBtn.style.display = "flex";
    battleDurationSelect.value = duration;
  } else {
    hostMapBtn.style.display = "none";
    startBtn.style.display = "none";
  }

  // Update Preview if map changed
  if (selectedMapId) {
    updateMapPreview(selectedMapId);
  }
});

function getRoleColor(role) {
    switch(role) {
        case "damager": return "#ff4757";
        case "tanker": return "#ffa502";
        case "healer": return "#2ed573";
        default: return "#ffffff";
    }
}

// --- Map Preview & List Modal ---
async function refreshMapListModal() {
  const listContainer = document.getElementById("map-select-list");
  if (!listContainer || isMapLoading) return;

  isMapLoading = true;
  listContainer.innerHTML = '<div style="color:#00f2fe; padding:20px; text-align:center; grid-column: span 2;">Memuat Arena...</div>';

  try {
    const res = await fetch("/api/maps");
    const maps = await res.json();
    
    listContainer.innerHTML = ""; // Clear loader

    for (const mapId of maps) {
      const displayName = mapId.replace(".json", "").replace(/[-_]/g, " ").toUpperCase();
      const isActive = mapId === lastSelectedMapId;

      const card = document.createElement("div");
      card.className = `map-card ${isActive ? 'active' : ''}`;
      card.setAttribute("data-id", mapId);
      card.innerHTML = `
        <canvas class="map-card-canvas" width="200" height="120"></canvas>
        <div class="map-card-label">${displayName}</div>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".map-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        lastSelectedMapId = mapId;
        updateMapPreview(mapId);
      });

      listContainer.appendChild(card);

      // Render mini preview immediately for this card
      const miniCanvas = card.querySelector(".map-card-canvas");
      fetch(`/api/maps/${mapId}`)
        .then(r => r.json())
        .then(mapData => renderMapPreview(miniCanvas, mapData))
        .catch(e => console.error("Mini preview error:", e));
    }

  } catch (e) {
    listContainer.innerHTML = '<div style="color:#ff4757; padding:20px; text-align:center; grid-column: span 2;">Gagal memuat maps</div>';
  } finally {
    isMapLoading = false;
  }
}

// --- Rest of the logic (Game Start, Loading, etc) ---
startBtn.addEventListener("click", () => {
  requestStartGame();
});

onMatchPreparing(() => {
  const loadingOverlay = document.getElementById("match-loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "flex";
});

onMatchFound((data) => {
  const { duration, players, mapData } = data;
  const loadingOverlay = document.getElementById("match-loading-overlay");
  const loadingList = document.getElementById("loading-player-list");
  
  if (loadingOverlay) loadingOverlay.style.display = "flex";
  
  if (loadingList) {
    loadingList.innerHTML = players.map(p => `
      <div class="loading-player-item" id="lp-${p.id}">
        <span class="lp-name" style="color:${p.color}">${p.name} ${p.id === getMyId() ? '' : ''}</span>
        <span class="lp-status loading" id="lp-status-${p.id}">LOADING...</span>
      </div>
    `).join("");
  }

  setTimeout(() => {
    initGameConfig(duration, players, mapData);
    lobbyMenu.style.display = "none";
    if (document.getElementById("lobby-bg")) document.getElementById("lobby-bg").style.display = "none";
    gameContainer.style.display = "block";

    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    } catch (e) { }

    window.dispatchEvent(new Event("resize"));
    emitPlayerReady();
  }, 50);
});

onMatchLoadingUpdate(({ readyPlayerIds }) => {
  readyPlayerIds.forEach(id => {
    const statusEl = document.getElementById(`lp-status-${id}`);
    if (statusEl) {
      statusEl.innerText = "READY";
      statusEl.className = "lp-status ready";
    }
  });
});

onMatchStartFinal(() => {
  const loadingOverlay = document.getElementById("match-loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.opacity = "0";
    setTimeout(() => {
      loadingOverlay.style.display = "none";
      loadingOverlay.style.opacity = "1";
    }, 500);
  }
  startGame();
});

const returnLobbyBtn = document.getElementById("return-lobby-btn");
if (returnLobbyBtn) {
  returnLobbyBtn.addEventListener("click", () => {
    requestReturnLobby();
  });
}

onReturnToLobby(() => {
  stopGame();
  document.getElementById("game-over-overlay").style.display = "none";
  document.getElementById("game-container").style.display = "none";
  document.getElementById("lobby-menu").style.display = "flex";
  if (document.getElementById("lobby-bg")) document.getElementById("lobby-bg").style.display = "block";
  
  // Show waiting room directly (skip setup)
  lobbySetup.style.display = "none";
  playersContainer.style.display = "flex";
  spellInfoBtn.style.display = "flex";
  changeRoleBtn.style.display = "flex";

  // Maintain Fullscreen & Landscape
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch (e) { }

  window.dispatchEvent(new Event("resize"));
});


// Reuse existing updateMapPreview and renderMapPreview functions but adapted
async function updateMapPreview(mapId) {
  const canvas = document.getElementById("map-preview-canvas");
  if (!canvas) return;

  if (!mapId || mapId === "default") {
    // Fallback Galaxy
    renderMapPreview(canvas, { width: 1800, height: 900, obstacles: [], towers: [] });
    return;
  }

  try {
    const res = await fetch(`/api/maps/${mapId}`);
    const mapData = await res.json();
    renderMapPreview(canvas, mapData);
  } catch (e) {
    console.warn("Preview failed:", e);
  }
}

function renderMapPreview(canvas, mapData) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const margin = 10;
  let minX = 0, minY = 0;
  let maxX = mapData.width || 800;
  let maxY = mapData.height || 600;

  if (mapData.obstacles) {
    mapData.obstacles.forEach(obs => {
      minX = Math.min(minX, obs.x);
      minY = Math.min(minY, obs.y);
      maxX = Math.max(maxX, obs.x + obs.w);
      maxY = Math.max(maxY, obs.y + obs.h);
    });
  }
  
  const totalW = maxX - minX;
  const totalH = maxY - minY;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min((canvas.width - margin * 2) / totalW, (canvas.height - margin * 2) / totalH);
  const drawX = (canvas.width - totalW * scale) / 2;
  const drawY = (canvas.height - totalH * scale) / 2;

  const toCanvasX = (mx) => drawX + (mx - minX) * scale;
  const toCanvasY = (my) => drawY + (my - minY) * scale;

  ctx.strokeStyle = "rgba(0, 242, 254, 0.05)";
  const gridStep = 40 * scale;
  for (let x = drawX; x <= drawX + totalW * scale; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, drawY); ctx.lineTo(x, drawY + totalH * scale); ctx.stroke();
  }
  for (let y = drawY; y <= drawY + totalH * scale; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(drawX, y); ctx.lineTo(drawX + totalW * scale, y); ctx.stroke();
  }

  if (mapData.obstacles) {
    mapData.obstacles.forEach(obs => {
      ctx.fillStyle = obs.type === "border" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 242, 254, 0.4)";
      ctx.fillRect(toCanvasX(obs.x), toCanvasY(obs.y), obs.w * scale, obs.h * scale);
    });
  }

  if (mapData.towers) {
    mapData.towers.forEach(t => {
      ctx.beginPath();
      ctx.arc(toCanvasX(t.x + t.size / 2), toCanvasY(t.y + t.size / 2), (t.size / 2) * scale, 0, Math.PI * 2);
      ctx.fillStyle = t.label === "BASE" ? "#f1c40f" : "#00d2ff";
      ctx.fill();
    });
  }
}

