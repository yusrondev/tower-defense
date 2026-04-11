const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");

const btnWall = document.getElementById("tool-wall");
const btnTower = document.getElementById("tool-tower");
const btnErase = document.getElementById("tool-erase");
const btnClear = document.getElementById("btn-clear");
const btnSave = document.getElementById("btn-save");
const towerOptions = document.getElementById("tower-options");

const btnSelect = document.getElementById("tool-select");
const btnDuplicate = document.getElementById("btn-duplicate");
const btnWaypoint = document.getElementById("tool-waypoint");
const btnSpawn = document.getElementById("tool-spawn");
const ctxMenu = document.getElementById("context-menu");
const towerSequenceInfo = document.getElementById("tower-sequence-info");
const propPane = document.getElementById("properties-pane");
const wallAngleInput = document.getElementById("wall-angle");
const mapListContainer = document.getElementById("map-list");

let currentTool = "wall"; // "wall", "tower", "erase", "select", "waypoint", "spawn"
let selectedItem = null;
let draggingItem = null;
let dragX = 0;
let dragY = 0;
let currentLoadedMap = null; // Track filename if loaded
let mapWidth = 1800;
let mapHeight = 900;

// Map state
let obstacles = [];
function initBorders() {
    obstacles = [
        { x: 0, y: -20, w: mapWidth, h: 20, color: "#444", type: "border" },      // Top
        { x: 0, y: mapHeight, w: mapWidth, h: 20, color: "#444", type: "border" }, // Bottom
        { x: -20, y: 0, w: 20, h: mapHeight, color: "#444", type: "border" },    // Left
        { x: mapWidth, y: 0, w: 20, h: mapHeight, color: "#444", type: "border" }  // Right
    ];
}
initBorders();
let towers = [];
let waypoints = []; // [{x, y}]
let playerSpawns = []; // [{x, y}]

// Interaction state
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
const SNAP_GRID = 20;

function snap(val) {
    return Math.round(val / SNAP_GRID) * SNAP_GRID;
}

// Tool switching
btnWall.addEventListener("click", () => setTool("wall", btnWall));
btnTower.addEventListener("click", () => setTool("tower", btnTower));
btnSelect.addEventListener("click", () => setTool("select", btnSelect));
btnWaypoint.addEventListener("click", () => setTool("waypoint", btnWaypoint));
btnSpawn.addEventListener("click", () => setTool("spawn", btnSpawn));
btnErase.addEventListener("click", () => setTool("erase", btnErase));

const mapWidthInput = document.getElementById("map-width");
const mapHeightInput = document.getElementById("map-height");

function resizeMap(w, h) {
    mapWidth = parseInt(w) || 1800;
    mapHeight = parseInt(h) || 900;
    
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    
    // Update border obstacles
    if (obstacles.length >= 4) {
        // Find by type to be safe, but usually they are the first 4
        const borders = obstacles.filter(o => o.type === "border");
        if (borders.length === 4) {
            borders[0].w = mapWidth; // Top
            borders[1].y = mapHeight; // Bottom
            borders[1].w = mapWidth;
            borders[2].h = mapHeight; // Left
            borders[3].x = mapWidth; // Right
            borders[3].h = mapHeight;
        }
    }
    draw();
}

mapWidthInput.addEventListener("change", (e) => resizeMap(e.target.value, mapHeight));
mapHeightInput.addEventListener("change", (e) => resizeMap(mapWidth, e.target.value));

function updateTowerInfo() {
    if (towers.length === 0) towerSequenceInfo.innerText = "Next: TOWER 1";
    else if (towers.length === 1) towerSequenceInfo.innerText = "Next: TOWER 2";
    else if (towers.length === 2) towerSequenceInfo.innerText = "Next: BASE";
    else towerSequenceInfo.innerText = "MAX TOWERS REACHED";
}

function setTool(tool, btn) {
    currentTool = tool;
    document.querySelectorAll("#header button").forEach(b => b.classList.remove("active-tool"));
    if (btn) btn.classList.add("active-tool");
    
    // UI visibility updates
    propPane.style.display = (tool === "tower" || tool === "waypoint" || tool === "spawn" || (tool === "select" && selectedItem)) ? "block" : "none";
    towerOptions.style.display = tool === "tower" ? "block" : "none";
    document.getElementById("waypoint-options").style.display = (tool === "waypoint" || (tool === "select" && selectedItem && selectedItem.type === "waypoint")) ? "block" : "none";
    document.getElementById("wall-options").style.display = (tool === "wall" || (tool === "select" && selectedItem && !selectedItem.label && selectedItem.type !== "waypoint" && selectedItem.type !== "spawn")) ? "block" : "none";
    
    // Sync input if select tool and wall selected
    if (tool === "select" && selectedItem && !selectedItem.label && selectedItem.type !== "waypoint" && selectedItem.type !== "spawn") {
        wallAngleInput.value = selectedItem.angle || 0;
    }
    
    // Clear selection when changing tool unless it's select
    if (tool !== "select") {
        selectedItem = null;
        btnDuplicate.style.display = "none";
    } else {
        // If switched to select, but nothing selected yet, hide properties
        if (!selectedItem) propPane.style.display = "none";
    }
    
    if (tool === "tower") updateTowerInfo();
    if (tool === "waypoint") updateWaypointInfo();
    draw();
}

function updateWaypointInfo() {
    const wpInfo = document.getElementById("wp-index-info");
    if (selectedItem && selectedItem.type === "waypoint") {
        wpInfo.innerText = "Selected Waypoint #" + (waypoints.indexOf(selectedItem) + 1);
    } else {
        wpInfo.innerText = "Next Waypoint #" + (waypoints.length + 1);
    }
}

// Rotation sync listener
wallAngleInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value) || 0;
    if (currentTool === "wall") {
        // placeholder for next drawn wall
    } else if (currentTool === "select" && selectedItem && !selectedItem.label) {
        selectedItem.angle = val;
        draw();
    }
});

btnSave.addEventListener("click", async () => {
    if (towers.length !== 3) {
        alert("Anda harus memasang tepat 3 Tower sebelum menyimpan map.");
        return;
    }

    let mapName = currentLoadedMap ? currentLoadedMap.replace('.json', '') : "";
    
    // If opening an existing map, we can just save it. If new, ask name.
    if (!mapName) {
        mapName = prompt("Masukkan nama Map (Tanpa ekstensi .json):");
    } else {
        if (!confirm(`Overwrite existing map "${mapName}"?`)) {
            mapName = prompt("Simpan sebagai Nama Map baru:", mapName);
        }
    }
    
    if (!mapName) return;

    const formattedName = mapName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${formattedName}.json`;

    try {
        const mapData = {
            name: formattedName,
            width: mapWidth,
            height: mapHeight,
            obstacles: obstacles,
            towers: towers,
            waypoints: waypoints,
            playerSpawns: playerSpawns
        };

        const res = await fetch(`/api/maps?filename=${filename}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mapData)
        });
        const data = await res.json();
        if (data.success) {
            alert(`Map saved successfully!`);
            currentLoadedMap = data.filename;
            loadMapList();
        } else {
            alert("Error saving map.");
        }
    } catch (e) {
        alert("Failed to reach server to save map.");
        console.error(e);
    }
});

async function deleteMap(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;
    try {
        const res = await fetch(`/api/maps/${filename}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            if (currentLoadedMap === filename) {
                mapWidth = 1800;
                mapHeight = 900;
                initBorders();
                towers = [];
                waypoints = [];
                playerSpawns = [];
                currentLoadedMap = null;
            }
            loadMapList();
            draw();
        }
    } catch (e) {
        alert("Delete failed");
    }
}

async function loadMapList() {
    try {
        const res = await fetch("/api/maps");
        const files = await res.json();
        mapListContainer.innerHTML = "";
        files.forEach(file => {
            const div = document.createElement("div");
            div.className = "map-item" + (currentLoadedMap === file ? " active" : "");
            
            const nameSpan = document.createElement("span");
            nameSpan.innerText = file;
            nameSpan.style.flex = "1";
            nameSpan.onclick = () => loadMap(file);
            div.appendChild(nameSpan);

            const delBtn = document.createElement("button");
            delBtn.className = "delete-map-btn";
            delBtn.innerText = "✕";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteMap(file);
            };
            div.appendChild(delBtn);

            mapListContainer.appendChild(div);
        });
    } catch (e) {
        console.error("Failed to load map list", e);
    }
}

// Tower properties sync listeners
document.getElementById("tower-hp").addEventListener("input", (e) => {
    const val = parseInt(e.target.value) || 500;
    if (currentTool === "select" && selectedItem && selectedItem.label) {
        selectedItem.maxHp = val;
        selectedItem.hp = val;
        draw();
    }
});

document.getElementById("tower-size").addEventListener("input", (e) => {
    const val = parseInt(e.target.value) || 80;
    if (currentTool === "select" && selectedItem && selectedItem.label) {
        selectedItem.size = val;
        draw();
    }
});

async function loadMap(filename) {
    try {
        const res = await fetch(`/api/maps/${filename}`);
        const data = await res.json();
        mapWidth = data.width || 1800;
        mapHeight = data.height || 900;
        mapWidthInput.value = mapWidth;
        mapHeightInput.value = mapHeight;
        canvas.width = mapWidth;
        canvas.height = mapHeight;

        obstacles = data.obstacles || [];
        towers = data.towers || [];
        waypoints = data.waypoints || [];
        playerSpawns = data.playerSpawns || [];
        currentLoadedMap = filename;
        loadMapList(); // Refresh active state
        draw();
    } catch (e) {
        alert("Error loading map");
        console.error(e);
    }
}

btnClear.addEventListener("click", () => {
    if (confirm("Clear all custom walls, towers, path waypoints, and spawn points?")) {
        // keep borders
        mapWidth = 1800;
        mapHeight = 900;
        mapWidthInput.value = 1800;
        mapHeightInput.value = 900;
        canvas.width = 1800;
        canvas.height = 900;
        initBorders();
        towers = [];
        waypoints = [];
        playerSpawns = [];
        draw();
    }
});

btnDuplicate.addEventListener("click", () => {
    if (!selectedItem || selectedItem.label || selectedItem.type === "waypoint" || selectedItem.type === "spawn") return;
    
    const newItem = { ...selectedItem, x: selectedItem.x + 20, y: selectedItem.y + 20 };
    obstacles.push(newItem);
    selectedItem = newItem;
    draw();
});

function getMousePos(e, doSnap = true) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;
    return {
        x: doSnap ? snap(rawX) : rawX,
        y: doSnap ? snap(rawY) : rawY
    };
}

function findItemAt(x, y) {
    // Check waypoints first
    for (const wp of waypoints) {
        const dist = Math.sqrt((x - wp.x) ** 2 + (y - wp.y) ** 2);
        if (dist < 15) return wp;
    }
    // Check player spawns
    for (const ps of playerSpawns) {
        const dist = Math.sqrt((x - ps.x) ** 2 + (y - ps.y) ** 2);
        if (dist < 15) return ps;
    }
    // Check towers
    for (const t of towers) {
        if (x >= t.x && x <= t.x + t.size && y >= t.y && y <= t.y + t.size) {
            return t;
        }
    }
    // Check walls (skip borders)
    for (let i = obstacles.length - 1; i >= 4; i--) {
        const o = obstacles[i];
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const angleRad = (o.angle || 0) * Math.PI / 180;
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(-angleRad) - dy * Math.sin(-angleRad);
        const localY = dx * Math.sin(-angleRad) + dy * Math.cos(-angleRad);
        if (localX >= -o.w / 2 && localX <= o.w / 2 && localY >= -o.h / 2 && localY <= o.h / 2) {
            return o;
        }
    }
    return null;
}

canvas.addEventListener("mousedown", (e) => {
    const pos = getMousePos(e);
    if (currentTool === "wall") {
        isDrawing = true;
        startX = pos.x;
        startY = pos.y;
        currentX = pos.x;
        currentY = pos.y;
    } else if (currentTool === "tower") {
        if (towers.length >= 3) {
            alert("Maksimum 3 tower (Tower 1, Tower 2, Base) sudah tercapai.");
            return;
        }
        const hp = parseInt(document.getElementById("tower-hp").value) || 500;
        const size = parseInt(document.getElementById("tower-size").value) || 80;
        
        let label = "TOWER 1";
        if (towers.length === 1) label = "TOWER 2";
        if (towers.length === 2) label = "BASE";

        towers.push({ x: pos.x, y: pos.y, maxHp: hp, hp: hp, size: size, label: label });
        updateTowerInfo();
        draw();
    } else if (currentTool === "waypoint") {
        const wp = { x: pos.x, y: pos.y, type: "waypoint" };
        waypoints.push(wp);
        selectedItem = wp;
        updateWaypointInfo();
        draw();
    } else if (currentTool === "spawn") {
        const ps = { x: pos.x, y: pos.y, type: "spawn" };
        playerSpawns.push(ps);
        selectedItem = ps;
        draw();
    } else if (currentTool === "select") {
        ctxMenu.style.display = "none";
        const hit = findItemAt(pos.x, pos.y);
        selectedItem = hit;
        if (hit) {
            draggingItem = hit;
            dragX = pos.x - hit.x;
            dragY = pos.y - hit.y;
            btnDuplicate.style.display = (hit.label || hit.type === "waypoint" || hit.type === "spawn") ? "none" : "block";
            
            // Show properties
            propPane.style.display = "block";
            if (hit.label) {
                // Tower
                towerOptions.style.display = "block";
                document.getElementById("waypoint-options").style.display = "none";
                document.getElementById("wall-options").style.display = "none";
                updateTowerInfo();
                document.getElementById("tower-hp").value = hit.maxHp;
                document.getElementById("tower-size").value = hit.size;
            } else if (hit.type === "waypoint") {
                // Waypoint
                towerOptions.style.display = "none";
                document.getElementById("waypoint-options").style.display = "block";
                document.getElementById("wall-options").style.display = "none";
                updateWaypointInfo();
            } else if (hit.type === "spawn") {
                // Spawn Point
                towerOptions.style.display = "none";
                document.getElementById("waypoint-options").style.display = "none";
                document.getElementById("wall-options").style.display = "none";
            } else {
                // Wall
                towerOptions.style.display = "none";
                document.getElementById("waypoint-options").style.display = "none";
                document.getElementById("wall-options").style.display = "block";
                wallAngleInput.value = hit.angle || 0;
            }
        } else {
            btnDuplicate.style.display = "none";
            propPane.style.display = "none";
        }
        draw();
    } else if (currentTool === "erase") {
        eraseAt(pos.x, pos.y);
        updateTowerInfo();
    }
});

canvas.addEventListener("mousemove", (e) => {
    const pos = getMousePos(e);
    if (isDrawing && currentTool === "wall") {
        currentX = pos.x;
        currentY = pos.y;
        draw();
    } else if (draggingItem && currentTool === "select") {
        draggingItem.x = pos.x - dragX;
        draggingItem.y = pos.y - dragY;
        draw();
    } else if (currentTool === "erase" && e.buttons === 1) { // drag erase
        eraseAt(pos.x, pos.y);
        updateTowerInfo();
    }
});

canvas.addEventListener("mouseup", (e) => {
    isDrawing = false;
    draggingItem = null;
    
    if (currentTool === "wall") {
        const w = currentX - startX;
        const h = currentY - startY;
        
        let ox = w < 0 ? currentX : startX;
        let oy = h < 0 ? currentY : startY;
        let ow = Math.abs(w);
        let oh = Math.abs(h);
        
        if (ow === 0 || oh === 0) return;

        const angleInput = document.getElementById("wall-angle");
        const angle = angleInput ? (parseFloat(angleInput.value) || 0) : 0;

        obstacles.push({ x: ox, y: oy, w: ow, h: oh, angle: angle, color: "#444" });
        draw();
    }
});

function eraseAt(x, y) {
    const hitBoxDist = 10;
    // Erase player spawns
    for (let i = playerSpawns.length - 1; i >= 0; i--) {
        const ps = playerSpawns[i];
        const dist = Math.sqrt((x - ps.x) ** 2 + (y - ps.y) ** 2);
        if (dist < 15) {
            playerSpawns.splice(i, 1);
            if (selectedItem === ps) selectedItem = null;
            draw();
            return;
        }
    }
    // Erase waypoints
    for (let i = waypoints.length - 1; i >= 0; i--) {
        const wp = waypoints[i];
        const dist = Math.sqrt((x - wp.x) ** 2 + (y - wp.y) ** 2);
        if (dist < 15) {
            waypoints.splice(i, 1);
            if (selectedItem === wp) selectedItem = null;
            draw();
            return;
        }
    }
    // Erase towers
    for (let i = towers.length - 1; i >= 0; i--) {
        const t = towers[i];
        if (x >= t.x && x <= t.x + t.size && y >= t.y && y <= t.y + t.size) {
            towers.splice(i, 1);
            if (selectedItem === t) selectedItem = null;
            draw();
            return;
        }
    }
    // Erase walls
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        if (o.type === "border") continue; // Protect borders
        
        const cx = o.x + o.w/2;
        const cy = o.y + o.h/2;
        const angleRad = (o.angle || 0) * Math.PI / 180;
        
        // Translate point to center, rotate back, and check AABB
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(-angleRad) - dy * Math.sin(-angleRad);
        const localY = dx * Math.sin(-angleRad) + dy * Math.cos(-angleRad);
        
        if (localX >= -o.w/2 && localX <= o.w/2 && localY >= -o.h/2 && localY <= o.h/2) {
            obstacles.splice(i, 1);
            if (selectedItem === o) selectedItem = null;
            draw();
            return;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Grid
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for(let x = 0; x < canvas.width; x += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = 0; y < canvas.height; y += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw Obstacles
    obstacles.forEach(obs => {
        ctx.save();
        const angleRad = (obs.angle || 0) * Math.PI / 180;
        const cx = obs.x + obs.w/2;
        const cy = obs.y + obs.h/2;
        
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        
        ctx.fillStyle = obs.color || "#444";
        ctx.fillRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        
        // Highlight selection
        if (selectedItem === obs) {
            ctx.strokeStyle = "yellow";
            ctx.lineWidth = 4;
        } else {
            ctx.strokeStyle = "cyan";
            ctx.lineWidth = 2;
        }
        ctx.strokeRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        
        ctx.restore();
    });

    // Draw active drawing shape
    if (isDrawing && currentTool === "wall") {
        let w = currentX - startX;
        let h = currentY - startY;
        let x = w < 0 ? currentX : startX;
        let y = h < 0 ? currentY : startY;
        w = Math.abs(w);
        h = Math.abs(h);
        if (w === 0) w = SNAP_GRID;
        if (h === 0) h = SNAP_GRID;
        
        const angleInput = document.getElementById("wall-angle");
        const angle = angleInput ? (parseFloat(angleInput.value) || 0) : 0;
        const angleRad = angle * Math.PI / 180;
        const cx = x + w/2;
        const cy = y + h/2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        
        ctx.fillStyle = "rgba(0, 255, 255, 0.3)";
        ctx.fillRect(-w/2, -h/2, w, h);
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
        ctx.strokeRect(-w/2, -h/2, w, h);
        
        ctx.restore();
    }

    // Draw Towers
    towers.forEach(t => {
        const tx = t.x;
        const ty = t.y;
        
        // Highlight selection
        if (selectedItem === t) {
            ctx.save();
            ctx.strokeStyle = "yellow";
            ctx.lineWidth = 3;
            ctx.strokeRect(tx - 5, ty - 5, t.size + 10, t.size + 10);
            ctx.restore();
        }

        // Base shadow
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.ellipse(tx + t.size / 2, ty + t.size + 5, t.size / 1.5, t.size / 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tower Body
        ctx.fillStyle = "#34495e";
        ctx.beginPath();
        ctx.moveTo(tx + t.size * 0.2, ty + t.size);
        ctx.lineTo(tx + t.size * 0.8, ty + t.size);
        ctx.lineTo(tx + t.size, ty + t.size * 0.2);
        ctx.lineTo(tx + t.size / 2, ty);
        ctx.lineTo(tx, ty + t.size * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "cyan";
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(t.label, tx + t.size / 2, ty - 10);
        ctx.fillText(`HP: ${t.maxHp}`, tx + t.size / 2, ty + t.size / 2);
    });

    // Draw Waypoints
    if (waypoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 242, 254, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        waypoints.forEach((wp, i) => {
            if (i === 0) ctx.moveTo(wp.x, wp.y);
            else ctx.lineTo(wp.x, wp.y);
        });
        ctx.stroke();

        waypoints.forEach((wp, i) => {
            ctx.fillStyle = (selectedItem === wp) ? "yellow" : "rgba(0, 242, 254, 0.8)";
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = "white";
            ctx.font = "bold 10px Arial";
            ctx.fillText(i + 1, wp.x, wp.y - 12);
        });
        ctx.restore();
    }

    // Draw Player Spawns
    playerSpawns.forEach((ps, i) => {
        ctx.save();
        ctx.fillStyle = (selectedItem === ps) ? "yellow" : "#2ecc71";
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.fillText("P" + (i + 1), ps.x, ps.y + 4);
        ctx.restore();
    });
}

// Handle Delete key
window.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Del") && selectedItem) {
        // Prevent accidental deletion if focus is on input
        if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        
        eraseAt(selectedItem.x, selectedItem.y);
        selectedItem = null;
        draw();
    }
});

// --- Context Menu Logic ---
canvas.oncontextmenu = (e) => {
    e.preventDefault();
    const pos = getMousePos(e, false); // No snap for menu placement
    
    // Auto-select item under cursor
    const hit = findItemAt(pos.x, pos.y);
    if (hit) {
        selectedItem = hit;
        setTool("select", btnSelect);
    }

    // Calculate position relative to viewport container
    const viewport = document.getElementById("editor-viewport");
    const rect = viewport.getBoundingClientRect();
    
    ctxMenu.style.display = "block";
    ctxMenu.style.left = (e.clientX - rect.left + viewport.scrollLeft) + "px";
    ctxMenu.style.top = (e.clientY - rect.top + viewport.scrollTop) + "px";
};

window.addEventListener("click", () => {
    ctxMenu.style.display = "none";
});

document.getElementById("cm-duplicate").onclick = () => btnDuplicate.click();
document.getElementById("cm-delete").onclick = () => {
    if (selectedItem) {
        eraseAt(selectedItem.x, selectedItem.y);
        ctxMenu.style.display = "none";
    }
};
document.getElementById("cm-clear-sel").onclick = () => {
    selectedItem = null;
    draw();
    ctxMenu.style.display = "none";
};

// Initial load
loadMapList();
draw();
