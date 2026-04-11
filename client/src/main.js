import { connectSocket, joinRoom, requestStartGame, updateSettings, onSettingsUpdated, onLobbyUpdate, onMatchFound, getMyId, requestReturnLobby, onReturnToLobby } from "./network/socket.js";
import { initGameConfig, startGame, stopGame } from "./game/gameLoop.js";
await connectSocket();

const joinBtn = document.getElementById("join-room-btn");
const startBtn = document.getElementById("start-game-btn");
const roomInput = document.getElementById("room-id-input");
const lobbyStatus = document.getElementById("lobby-status");
const lobbyMenu = document.getElementById("lobby-menu");
const gameContainer = document.getElementById("game-container");
let selectedRole = "damager";
let isMapLoading = false;

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️"
  };

  const titles = {
    success: "Berhasil",
    error: "Error",
    warning: "Perhatian",
    info: "Info"
  };

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
  
  // Trigger animation
  setTimeout(() => toast.classList.add("active"), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove("active");
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Role Selection Logic
const roleCards = document.querySelectorAll(".role-card");
const roleInfoItems = document.querySelectorAll(".role-info-item");

roleCards.forEach(card => {
  card.addEventListener("click", () => {
    roleCards.forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedRole = card.getAttribute("data-role");

    // Toggle Info Accordion
    roleInfoItems.forEach(item => {
      item.classList.remove("active");
      if (item.getAttribute("data-role") === selectedRole) {
        item.classList.add("active");
      }
    });
  });
});

joinBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  const playerName = document.getElementById("player-name-input").value.trim();
  
  // Validation Rules
  const nameRegex = /^[a-zA-Z0-9 ]{3,12}$/;
  const roomRegex = /^[a-zA-Z0-9]{1,10}$/;

  if (!playerName) {
    showToast("Silakan masukkan nama kamu!", "warning");
    return;
  }

  if (!nameRegex.test(playerName)) {
    showToast("Nama harus 3-12 karakter & Alfanumerik!", "error");
    return;
  }

  if (!roomId) {
    showToast("ID Room harus diisi!", "warning");
    return;
  }

  if (!roomRegex.test(roomId)) {
    showToast("ID Room harus Alfanumerik (maks 10 karakter)!", "error");
    return;
  }

  // If validation pass
  joinRoom(roomId, playerName, selectedRole);
  joinBtn.style.display = "none";
  document.getElementById("lobby-setup").style.display = "none";
  showToast("Menghubungkan ke Room...", "success");
  
  // Fullscreen pancingan dihilangkan (request user: jangan langsung FS di lobby)
  /*
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => console.log("Lobby Fullscreen blocked:", err));
    }
  } catch (e) { }
  */
});

const durationSelect = document.getElementById("battle-duration");
const mapSelect = document.getElementById("map-select");

durationSelect.addEventListener("change", () => {
  updateSettings(durationSelect.value, mapSelect.value);
});

mapSelect.addEventListener("change", () => {
  updateSettings(durationSelect.value, mapSelect.value);
});

onSettingsUpdated(({ duration, mapId }) => {
  if (duration !== undefined) durationSelect.value = duration;
  if (mapId !== undefined) mapSelect.value = mapId;
});

startBtn.addEventListener("click", () => {
  // Fullscreen lagi buat host saat mulai (user gesture)
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => { });
    }
  } catch (e) { }
  requestStartGame();
});

onLobbyUpdate(async ({ players, duration, selectedMapId }) => {
  const container = document.getElementById("players-container");
  const lobbyPlayersList = document.getElementById("lobby-players-list");
  const hostSettings = document.getElementById("host-settings");

  container.innerHTML = "";
  lobbyPlayersList.style.display = "block";
  durationSelect.value = duration;
  
  // Refresh list jika dropdown kosong atau mapId baru tidak ada di list
  const currentOptions = Array.from(mapSelect.options).map(opt => opt.value);
  if (selectedMapId && !currentOptions.includes(selectedMapId)) {
    await refreshMapList();
  }
  
  if (selectedMapId) {
    // Pastikan valuenya benar-benar ada sebelum set (mencegah reset ke default jika telat)
    if (Array.from(mapSelect.options).some(opt => opt.value === selectedMapId)) {
      mapSelect.value = selectedMapId;
    }
  }

  // Cek apakah saya Host
  const me = players.find(p => p.id === getMyId());
  if (me && me.isHost) {
    startBtn.style.display = "inline-block";
    hostSettings.style.display = "block";
  } else {
    startBtn.style.display = "none";
    hostSettings.style.display = "none";
  }

  players.forEach(p => {
    const div = document.createElement("div");
    div.className = "player-entry";
    div.innerHTML = `
            <span style="color:${p.color}">${p.name}</span>
            ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
        `;
    container.appendChild(div);
  });
});

// When game starts!
onMatchFound((data) => {
  const { duration, players, mapData } = data;
  initGameConfig(duration, players, mapData);

  lobbyMenu.style.display = "none";
  gameContainer.style.display = "block";

  // Attempt Fullscreen and Landscape lock
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => console.log("Fullscreen API ditolak/gak support:", err));
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(err => console.log("Landscape Lock API ditolak/gak support:", err));
    }
  } catch (e) { }

  // Pancing ulang resize untuk menata ulang layout ukuran setelah Fullscreen
  window.dispatchEvent(new Event("resize"));

  startGame();
  
  // Prevent selection/copy behavior on skill buttons
  document.querySelectorAll(".btn").forEach(btn => {
    const prevent = (e) => {
      // Allow the click event to fire but prevent selection
      if (e.type === "touchstart" || e.button === 0) {
        // We don't want to preventDefault on click/touchstart entirely 
        // because we want the game's input listeners to still work.
        // However, most browsers skip selection if preventDefault is called on mousedown.
      }
    };
    btn.addEventListener("mousedown", (e) => {
      // If we preventDefault here, it might break the game's click listener if it's on the same element.
      // Let's test if user-select: none in CSS is enough. 
      // User said it still happens, so maybe we need to be more aggressive.
    });
  });
});

const returnLobbyBtn = document.getElementById("return-lobby-btn");
if (returnLobbyBtn) {
  returnLobbyBtn.addEventListener("click", () => {
    requestReturnLobby();
  });
}

onReturnToLobby(() => {
  stopGame(); // Stop game loop
  
  // Sembunyikan UI Game & Tampilkan UI Lobby
  document.getElementById("game-over-overlay").style.display = "none";
  document.getElementById("game-container").style.display = "none";
  document.getElementById("lobby-menu").style.display = "flex";
  
  // Karena kembali ke lobby, reset text game over
  showToast("Berhasil kembali ke Lobby!", "success");

  // Exit Fullscreen dan Kembalikan ke Potrait (Lobby View)
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
      // Opsional: Coba paksa potrait jika didukung
      if (screen.orientation.lock) {
          screen.orientation.lock("portrait").catch(() => {});
      }
    }
  } catch (e) {}
});

async function refreshMapList() {
  if (isMapLoading) return;
  
  const mapSelect = document.getElementById("map-select");
  if (!mapSelect) return;

  isMapLoading = true;
  try {
    // Show loading state
    const oldValue = mapSelect.value;
    mapSelect.innerHTML = '<option value="default">Loading maps...</option>';

    const res = await fetch("/api/maps");
    if (!res.ok) throw new Error("Server response not OK");
    
    const maps = await res.json();
    
    // Clear and build list
    mapSelect.innerHTML = '<option value="default">Default Map</option>';
    
    maps.forEach(mapFile => {
      const displayName = mapFile
        .replace(".json", "")
        .replace(/[-_]/g, " ")
        .toUpperCase();

      const option = document.createElement("option");
      option.value = mapFile;
      option.innerText = displayName;
      mapSelect.appendChild(option);
    });

    // Restore old value if still valid
    const newOptions = Array.from(mapSelect.options).map(opt => opt.value);
    if (newOptions.includes(oldValue)) {
      mapSelect.value = oldValue;
    }
  } catch (e) {
    console.warn("Failed to refresh maps:", e);
    mapSelect.innerHTML = '<option value="default">Default Map (Failed to load list)</option>';
  } finally {
    isMapLoading = false;
  }
}

// Inisialisasi awal segera (Module execution)
refreshMapList();

// 🔥 pastikan DOM sudah siap (untuk pancingan tambahan jika diperlukan)
window.onload = async () => {
  // refreshMapList() sudah dipanggil di level modul, tapi panggil lagi jika list masih kosong
  if (document.getElementById("map-select")?.options.length <= 1) {
    await refreshMapList();
  }
};