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
const btnShape = document.getElementById("tool-shape");
const ctxMenu = document.getElementById("context-menu");
const towerSequenceInfo = document.getElementById("tower-sequence-info");
const propPane = document.getElementById("properties-pane");
const wallAngleInput = document.getElementById("wall-angle");
const mapListContainer = document.getElementById("map-list");
const btnNewMap = document.getElementById("btn-new-map");
const btnWelcomeNew = document.getElementById("btn-welcome-new");
const welcomeOverlay = document.getElementById("welcome-overlay");

// --- Custom Dialog System ---
const EditorDialog = {
    overlay: document.getElementById("editor-dialog-overlay"),
    title: document.getElementById("dialog-title-text"),
    message: document.getElementById("dialog-message-text"),
    inputContainer: document.getElementById("dialog-input-container"),
    inputField: document.getElementById("dialog-input-field"),
    btnCancel: document.getElementById("dialog-btn-cancel"),
    btnOk: document.getElementById("dialog-btn-ok"),

    _resolve: null,

    init() {
        this.btnOk.onclick = () => this.handleOk();
        this.btnCancel.onclick = () => this.handleCancel();
        this.inputField.onkeydown = (e) => {
            if (e.key === "Enter") this.handleOk();
            if (e.key === "Escape") this.handleCancel();
        };
    },

    show(type, msg, title = "EDITOR PRO", val = "") {
        this.init();
        this.title.innerText = title;
        this.message.innerText = msg;
        this.inputField.value = val;
        this.inputContainer.style.display = (type === "prompt") ? "block" : "none";
        this.btnCancel.style.display = (type === "alert") ? "none" : "block";
        this.btnOk.innerText = (type === "alert") ? "YAP" : (type === "confirm" ? "YA" : "SIMPAN");
        
        this.overlay.classList.add("active");
        if (type === "prompt") {
            setTimeout(() => {
                this.inputField.focus();
                this.inputField.select();
            }, 100);
        }

        return new Promise(res => {
            this._resolve = res;
        });
    },

    handleOk() {
        const isPrompt = this.inputContainer.style.display === "block";
        const val = this.inputField.value;
        this.close();
        if (this._resolve) this._resolve(isPrompt ? val : true);
    },

    handleCancel() {
        this.close();
        if (this._resolve) this._resolve(this.inputContainer.style.display === "block" ? null : false);
    },

    close() {
        this.overlay.classList.remove("active");
    },

    alert(msg, title) { return this.show("alert", msg, title); },
    confirm(msg, title) { return this.show("confirm", msg, title); },
    prompt(msg, val, title) { return this.show("prompt", msg, title, val); }
};


let currentTool = "wall"; // "wall", "tower", "erase", "select", "waypoint", "spawn", "shape"
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
// initBorders(); // Removed from global call
let towers = [];
let waypoints = []; // [{x, y}]
let playerSpawns = []; // [{x, y}]
let bgImage = null;     // base64 data URL string
let bgImageObj = null;  // HTMLImageElement cached

// --- Outer Background (outside arena) ---
let outerBgColor = "#000000";
let outerBgImage = null;
let outerBgImageObj = null;

// --- Background Image Upload Handlers ---
const bgInput = document.getElementById("bg-image-input");
const bgPreviewCanvas = document.getElementById("bg-preview");
const btnRemoveBg = document.getElementById("btn-remove-bg");

// --- Outer Background Handlers ---
const outerColorInput = document.getElementById("outer-color-input");
const outerImageInput = document.getElementById("outer-image-input");
const outerPreviewCanvas = document.getElementById("outer-preview");
const btnRemoveOuterBg = document.getElementById("btn-remove-outer-bg");

// --- Border Background Handlers ---
let borderBgImage = null;
const borderImageInput = document.getElementById("border-image-input");
const borderPreviewCanvas = document.getElementById("border-img-preview");
const btnRemoveBorderBg = document.getElementById("btn-remove-border-img");

function setGlobalBorderImage(dataUrl) {
    borderBgImage = dataUrl;
    
    // Apply automatically to borders
    obstacles.forEach(o => {
        if (o.type === "border") {
            o.texture = borderBgImage;
            o._textureImg = null;
            o._texturePat = null; // reset caches so draw() re-renders
        }
    });

    if (dataUrl) {
        const img = new Image();
        img.onload = () => {
            const pCtx = borderPreviewCanvas.getContext("2d");
            pCtx.clearRect(0, 0, borderPreviewCanvas.width, borderPreviewCanvas.height);
            pCtx.drawImage(img, 0, 0, borderPreviewCanvas.width, borderPreviewCanvas.height);
            borderPreviewCanvas.style.display = "block";
            btnRemoveBorderBg.style.display = "block";
            draw();
        };
        img.src = dataUrl;
    } else {
        borderPreviewCanvas.style.display = "none";
        btnRemoveBorderBg.style.display = "none";
        borderPreviewCanvas.getContext("2d").clearRect(0, 0, borderPreviewCanvas.width, borderPreviewCanvas.height);
        draw();
    }
}

borderImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setGlobalBorderImage(ev.target.result);
    reader.readAsDataURL(file);
});

btnRemoveBorderBg.addEventListener("click", () => {
    borderImageInput.value = "";
    setGlobalBorderImage(null);
});

function setOuterBgImage(dataUrl) {
    outerBgImage = dataUrl;
    outerBgImageObj = null;
    
    // Apply CSS to viewport for preview
    const viewport = document.getElementById("editor-viewport");
    if (viewport) {
        if (outerBgImage) {
            viewport.style.backgroundImage = `url(${outerBgImage})`;
            viewport.style.backgroundRepeat = "repeat";
        } else {
            viewport.style.backgroundImage = "none";
        }
    }

    if (dataUrl) {
        const img = new Image();
        img.onload = () => {
            outerBgImageObj = img;
            const pCtx = outerPreviewCanvas.getContext("2d");
            pCtx.clearRect(0, 0, outerPreviewCanvas.width, outerPreviewCanvas.height);
            pCtx.drawImage(img, 0, 0, outerPreviewCanvas.width, outerPreviewCanvas.height);
            outerPreviewCanvas.style.display = "block";
            btnRemoveOuterBg.style.display = "block";
            draw();
        };
        img.src = dataUrl;
    } else {
        outerPreviewCanvas.style.display = "none";
        btnRemoveOuterBg.style.display = "none";
        outerPreviewCanvas.getContext("2d").clearRect(0, 0, outerPreviewCanvas.width, outerPreviewCanvas.height);
        draw();
    }
}

outerColorInput.addEventListener("input", (e) => {
    outerBgColor = e.target.value;
    const viewport = document.getElementById("editor-viewport");
    if (viewport) viewport.style.backgroundColor = outerBgColor;
    draw();
});

outerImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setOuterBgImage(ev.target.result);
    reader.readAsDataURL(file);
});

btnRemoveOuterBg.addEventListener("click", () => {
    outerBgImage = null;
    outerBgImageObj = null;
    outerImageInput.value = "";
    setOuterBgImage(null);
});

function setBgImage(dataUrl) {
    bgImage = dataUrl;
    bgImageObj = null;
    if (dataUrl) {
        const img = new Image();
        img.onload = () => { bgImageObj = img; draw(); };
        img.src = dataUrl;
        // Show preview
        const pCtx = bgPreviewCanvas.getContext("2d");
        img.onload = () => {
            bgImageObj = img;
            pCtx.clearRect(0, 0, bgPreviewCanvas.width, bgPreviewCanvas.height);
            pCtx.drawImage(img, 0, 0, bgPreviewCanvas.width, bgPreviewCanvas.height);
            bgPreviewCanvas.style.display = "block";
            btnRemoveBg.style.display = "block";
            draw();
        };
    } else {
        bgPreviewCanvas.style.display = "none";
        btnRemoveBg.style.display = "none";
        bgPreviewCanvas.getContext("2d").clearRect(0, 0, bgPreviewCanvas.width, bgPreviewCanvas.height);
    }
}

bgInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target.result);
    reader.readAsDataURL(file);
});

btnRemoveBg.addEventListener("click", () => {
    bgImage = null;
    bgImageObj = null;
    bgInput.value = "";
    setBgImage(null);
    draw();
});

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
btnShape.addEventListener("click", () => setTool("shape", btnShape));
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
    document.querySelectorAll("#toolbar button").forEach(b => b.classList.remove("active-tool"));
    if (btn) btn.classList.add("active-tool");
    
    const isShape = selectedItem && selectedItem.type === "shape";
    const isWall = selectedItem && !selectedItem.label && selectedItem.type !== "waypoint" && selectedItem.type !== "spawn" && selectedItem.type !== "shape";

    // UI visibility updates
    propPane.style.display = (tool === "tower" || tool === "waypoint" || tool === "spawn" || (tool === "select" && selectedItem)) ? "block" : "none";
    towerOptions.style.display = (tool === "tower" || (tool === "select" && selectedItem && selectedItem.label)) ? "block" : "none";
    document.getElementById("waypoint-options").style.display = (tool === "waypoint" || (tool === "select" && selectedItem && selectedItem.type === "waypoint")) ? "block" : "none";
    document.getElementById("wall-options").style.display = (tool === "wall" || (tool === "select" && isWall)) ? "block" : "none";
    document.getElementById("shape-options").style.display = (tool === "shape" || (tool === "select" && isShape)) ? "block" : "none";
    
    // Sync inputs if select tool
    if (tool === "select" && selectedItem) {
        if (isWall) {
            wallAngleInput.value = selectedItem.angle || 0;
            updateWallTextureUI();
        } else if (isShape) {
            shapeCollision.checked = selectedItem.isCollision !== false;
            shapeColor.value = selectedItem.color || "#444444";
            shapeWidthInput.value = Math.round(selectedItem.w || 100);
            shapeHeightInput.value = Math.round(selectedItem.h || 100);
            updateShapeTextureUI();
        } else if (selectedItem.label) {
            // Tower
            document.getElementById("tower-hp").value = selectedItem.maxHp;
            document.getElementById("tower-size").value = selectedItem.size;
            updateTowerTextureUI();
        }
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

// --- Wall Texture Handlers ---
const wallTextureInput = document.getElementById("wall-texture-input");
const wallTexturePreview = document.getElementById("wall-texture-preview");
const btnRemoveWallTexture = document.getElementById("btn-remove-wall-texture");

function updateWallTextureUI() {
    if (selectedItem && selectedItem.texture) {
        if (!selectedItem._textureImg) {
            const img = new Image();
            img.onload = () => {
                selectedItem._textureImg = img;
                renderWallTexturePreview(img);
                draw();
            };
            img.src = selectedItem.texture;
        } else {
            renderWallTexturePreview(selectedItem._textureImg);
        }
        btnRemoveWallTexture.style.display = "block";
    } else {
        wallTexturePreview.style.display = "none";
        btnRemoveWallTexture.style.display = "none";
        wallTextureInput.value = "";
    }
}

function renderWallTexturePreview(img) {
    const pCtx = wallTexturePreview.getContext("2d");
    pCtx.clearRect(0, 0, wallTexturePreview.width, wallTexturePreview.height);
    pCtx.drawImage(img, 0, 0, wallTexturePreview.width, wallTexturePreview.height);
    wallTexturePreview.style.display = "block";
}

wallTextureInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !selectedItem || selectedItem.label || selectedItem.type === "waypoint" || selectedItem.type === "spawn") return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedItem.texture = ev.target.result;
        selectedItem._textureImg = null; // force reload
        selectedItem._texturePat = null; // force pattern recreation
        updateWallTextureUI();
    };
    reader.readAsDataURL(file);
});

btnRemoveWallTexture.addEventListener("click", () => {
    if (selectedItem) {
        selectedItem.texture = null;
        selectedItem._textureImg = null;
        selectedItem._texturePat = null;
        updateWallTextureUI();
        draw();
    }
});

// --- Tower Texture Handlers ---
const towerTextureInput = document.getElementById("tower-texture-input");
const towerTexturePreview = document.getElementById("tower-texture-preview");
const btnRemoveTowerTexture = document.getElementById("btn-remove-tower-texture");

function updateTowerTextureUI() {
    if (selectedItem && selectedItem.texture) {
        if (!selectedItem._textureImg || selectedItem._textureImg === "loading") {
            const img = new Image();
            img.onload = () => {
                selectedItem._textureImg = img;
                renderTowerTexturePreview(img);
                draw();
            };
            img.src = selectedItem.texture;
            selectedItem._textureImg = "loading";
        } else if (selectedItem._textureImg !== "loading") {
            renderTowerTexturePreview(selectedItem._textureImg);
        }
        btnRemoveTowerTexture.style.display = "block";
    } else {
        towerTexturePreview.style.display = "none";
        btnRemoveTowerTexture.style.display = "none";
        towerTextureInput.value = "";
    }
}

function renderTowerTexturePreview(img) {
    const pCtx = towerTexturePreview.getContext("2d");
    pCtx.clearRect(0, 0, towerTexturePreview.width, towerTexturePreview.height);
    pCtx.drawImage(img, 0, 0, towerTexturePreview.width, towerTexturePreview.height);
    towerTexturePreview.style.display = "block";
}

towerTextureInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !selectedItem || !selectedItem.label) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedItem.texture = ev.target.result;
        selectedItem._textureImg = null; // force reload
        updateTowerTextureUI();
    };
    reader.readAsDataURL(file);
});

btnRemoveTowerTexture.addEventListener("click", () => {
    if (selectedItem) {
        selectedItem.texture = null;
        selectedItem._textureImg = null;
        updateTowerTextureUI();
        draw();
    }
});

// --- Shape Property Handlers ---
const shapeCollision = document.getElementById("shape-collision");
const shapeColor = document.getElementById("shape-color");
const shapeWidthInput = document.getElementById("shape-width");
const shapeHeightInput = document.getElementById("shape-height");
const shapeTextureInput = document.getElementById("shape-texture-input");
const shapeTexturePreview = document.getElementById("shape-texture-preview");
const btnRemoveShapeTexture = document.getElementById("btn-remove-shape-texture");

function updateShapeTextureUI() {
    if (selectedItem && selectedItem.texture) {
        if (!selectedItem._textureImg || selectedItem._textureImg === "loading") {
            const img = new Image();
            img.onload = () => {
                selectedItem._textureImg = img;
                renderShapeTexturePreview(img);
                draw();
            };
            img.src = selectedItem.texture;
            selectedItem._textureImg = "loading";
        } else if (selectedItem._textureImg !== "loading") {
            renderShapeTexturePreview(selectedItem._textureImg);
        }
        btnRemoveShapeTexture.style.display = "block";
    } else {
        shapeTexturePreview.style.display = "none";
        btnRemoveShapeTexture.style.display = "none";
        shapeTextureInput.value = "";
    }
}

function renderShapeTexturePreview(img) {
    const pCtx = shapeTexturePreview.getContext("2d");
    pCtx.clearRect(0, 0, shapeTexturePreview.width, shapeTexturePreview.height);
    pCtx.drawImage(img, 0, 0, shapeTexturePreview.width, shapeTexturePreview.height);
    shapeTexturePreview.style.display = "block";
}

shapeCollision.addEventListener("change", (e) => {
    if (selectedItem && selectedItem.type === "shape") {
        selectedItem.isCollision = e.target.checked;
    }
});

shapeColor.addEventListener("input", (e) => {
    if (selectedItem && selectedItem.type === "shape") {
        selectedItem.color = e.target.value;
        draw();
    }
});

shapeWidthInput.addEventListener("input", (e) => {
    const val = parseInt(e.target.value) || 20;
    if (selectedItem && selectedItem.type === "shape") {
        selectedItem.w = val;
        draw();
    }
});

shapeHeightInput.addEventListener("input", (e) => {
    const val = parseInt(e.target.value) || 20;
    if (selectedItem && selectedItem.type === "shape") {
        selectedItem.h = val;
        draw();
    }
});

shapeTextureInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !selectedItem || selectedItem.type !== "shape") return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        selectedItem.texture = ev.target.result;
        selectedItem._textureImg = null; 
        updateShapeTextureUI();
    };
    reader.readAsDataURL(file);
});

btnRemoveShapeTexture.addEventListener("click", () => {
    if (selectedItem && selectedItem.type === "shape") {
        selectedItem.texture = null;
        selectedItem._textureImg = null;
        updateShapeTextureUI();
        draw();
    }
});

btnSave.addEventListener("click", async () => {
    if (towers.length !== 3) {
        await EditorDialog.alert("Anda harus memasang tepat 3 Tower sebelum menyimpan map.", "PERINGATAN");
        return;
    }

    let mapName = currentLoadedMap ? currentLoadedMap.replace('.json', '') : "";
    
    // If opening an existing map, we can just save it. If new, ask name.
    if (!mapName) {
        mapName = await EditorDialog.prompt("Masukkan nama Map (Tanpa ekstensi .json):", "", "SIMPAN MAP");
    } else {
        if (!await EditorDialog.confirm(`Overwrite existing map "${mapName}"?`, "KONFIRMASI SIMPAN")) {
            mapName = await EditorDialog.prompt("Simpan sebagai Nama Map baru:", mapName, "SIMPAN SEBAGAI");
        }
    }
    
    if (!mapName) return;

    const formattedName = mapName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${formattedName}.json`;

    btnSave.innerText = "⌛";
    btnSave.disabled = true;

    try {
        // Clean obstacles before saving (remove runtime objects to avoid JSON errors)
        const cleanObstacles = obstacles.map(obs => {
            const { _textureImg, _texturePat, ...rest } = obs;
            return rest;
        });

        // Clean towers
        const cleanTowers = towers.map(t => {
            const { _textureImg, ...rest } = t;
            return rest;
        });

        const mapData = {
            name: formattedName,
            width: mapWidth,
            height: mapHeight,
            bgImage: bgImage || null,
            outerBgColor: outerBgColor || "#000000",
            outerBgImage: outerBgImage || null,
            borderBgImage: borderBgImage || null,
            obstacles: cleanObstacles,
            towers: cleanTowers,
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
            await EditorDialog.alert(`Map saved successfully!`, "BERHASIL");
            currentLoadedMap = data.filename;
            loadMapList();
        } else {
            await EditorDialog.alert("Error saving map.", "GAGAL");
        }
    } catch (e) {
        await EditorDialog.alert("Failed to reach server to save map.", "KESALAHAN");
        console.error(e);
    } finally {
        btnSave.innerText = "💾";
        btnSave.disabled = false;
    }
});

async function deleteMap(filename) {
    if (!await EditorDialog.confirm(`Are you sure you want to delete "${filename}"?`, "KONFIRMASI HAPUS")) return;
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
                
                // Reset backgrounds too
                bgImage = null;
                bgImageObj = null;
                outerBgImage = null;
                outerBgImageObj = null;
                borderBgImage = null;
                
                currentLoadedMap = null;
                
                showWelcomeState();
            }
            loadMapList();
            draw();
        }
    } catch (e) {
        await EditorDialog.alert("Delete failed", "GAGAL");
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
        // Sanitize corrupted properties from previously saved maps
        obstacles.forEach(o => { delete o._textureImg; delete o._texturePat; });

        towers = data.towers || [];
        towers.forEach(t => { delete t._textureImg; });
        
        waypoints = data.waypoints || [];
        playerSpawns = data.playerSpawns || [];
        currentLoadedMap = filename;
        // Load background image if present
        if (data.bgImage) {
            setBgImage(data.bgImage);
        } else {
            bgImage = null; bgImageObj = null;
            setBgImage(null);
        }
        
        // Load outer background
        outerColorInput.value = data.outerBgColor || "#000000";
        outerBgColor = outerColorInput.value;
        const viewport = document.getElementById("editor-viewport");
        if (viewport) viewport.style.backgroundColor = outerBgColor;

        if (data.outerBgImage) {
            setOuterBgImage(data.outerBgImage);
        } else {
            outerBgImage = null; outerBgImageObj = null;
            setOuterBgImage(null);
        }

        // Load border background image globally
        if (data.borderBgImage) {
            setGlobalBorderImage(data.borderBgImage);
        } else {
            borderImageInput.value = "";
            setGlobalBorderImage(null);
        }
        
        loadMapList(); // Refresh active state
        showCanvasState(); // Hide welcome, show canvas
        draw();
    } catch (e) {
        await EditorDialog.alert("Error loading map", "GAGAL");
        console.error(e);
    }
}

function showWelcomeState() {
    welcomeOverlay.style.display = "flex";
    canvas.style.display = "none";
    propPane.style.display = "none";
    // Reset state
    currentLoadedMap = null;
    obstacles = [];
    towers = [];
    waypoints = [];
    playerSpawns = [];
}

function showCanvasState() {
    welcomeOverlay.style.display = "none";
    canvas.style.display = "block";
}

async function createNewMap() {
    if (currentLoadedMap || obstacles.length > 0) {
        if (!await EditorDialog.confirm("Start a new map? Unsaved changes will be lost.", "KONFIRMASI BARU")) return;
    }
    
    currentLoadedMap = null;
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
    bgImage = null; bgImageObj = null;
    setBgImage(null);
    setOuterBgImage(null);
    setGlobalBorderImage(null);
    
    showCanvasState();
    draw();
}

btnNewMap.addEventListener("click", createNewMap);
btnWelcomeNew.addEventListener("click", createNewMap);

btnClear.addEventListener("click", async () => {
    if (await EditorDialog.confirm("Clear all custom walls, towers, path waypoints, and spawn points?", "KONFIRMASI RESET")) {
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
    delete newItem._textureImg;
    delete newItem._texturePat;
    
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
    // Check walls (including borders)
    for (let i = obstacles.length - 1; i >= 0; i--) {
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

canvas.addEventListener("mousedown", async (e) => {
    const pos = getMousePos(e, currentTool !== "shape");
    if (currentTool === "wall" || currentTool === "shape") {
        isDrawing = true;
        startX = pos.x;
        startY = pos.y;
        currentX = pos.x;
        currentY = pos.y;
    } else if (currentTool === "tower") {
        if (towers.length >= 3) {
            await EditorDialog.alert("Maksimum 3 tower (Tower 1, Tower 2, Base) sudah tercapai.", "INFO TOWER");
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
        const rawPos = getMousePos(e, false);
        const hit = findItemAt(rawPos.x, rawPos.y); 
        selectedItem = hit;
        if (hit) {
            draggingItem = (hit.type === "border") ? null : hit;
            dragX = rawPos.x - hit.x;
            dragY = rawPos.y - hit.y;
            btnDuplicate.style.display = (hit.label || hit.type === "waypoint" || hit.type === "spawn" || hit.type === "border") ? "none" : "block";
            
            // Show properties via setTool
            setTool("select", btnSelect);
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
    const pos = getMousePos(e, currentTool !== "shape");
    if (isDrawing && (currentTool === "wall" || currentTool === "shape")) {
        currentX = pos.x;
        currentY = pos.y;
        draw();
    } else if (draggingItem && currentTool === "select") {
        const rawPos = getMousePos(e, false);
        draggingItem.x = Math.round((rawPos.x - dragX) / 10) * 10;
        draggingItem.y = Math.round((rawPos.y - dragY) / 10) * 10;
        draw();
    } else if (currentTool === "erase" && e.buttons === 1) { // drag erase
        eraseAt(pos.x, pos.y);
        updateTowerInfo();
    }
});

canvas.addEventListener("mouseup", (e) => {
    isDrawing = false;
    draggingItem = null;
    
    if (currentTool === "wall" || currentTool === "shape") {
        const w = currentX - startX;
        const h = currentY - startY;
        
        let ox = w < 0 ? currentX : startX;
        let oy = h < 0 ? currentY : startY;
        let ow = Math.abs(w);
        let oh = Math.abs(h);
        
        if (ow === 0 || oh === 0) return;

        if (currentTool === "wall") {
            const angleInput = document.getElementById("wall-angle");
            const angle = angleInput ? (parseFloat(angleInput.value) || 0) : 0;
            obstacles.push({ x: ox, y: oy, w: ow, h: oh, angle: angle, color: "#444" });
        } else {
            // Shape
            obstacles.push({ 
                type: "shape", 
                x: ox, y: oy, w: ow, h: oh, 
                color: shapeColor.value || "#444444", 
                isCollision: shapeCollision.checked 
            });
        }
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

// Arrow Key Nudge Logic for selected items
document.addEventListener("keydown", (e) => {
    if (currentTool === "select" && selectedItem && !selectedItem.label && selectedItem.type !== "waypoint" && selectedItem.type !== "spawn" && selectedItem.type !== "border") {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault(); // cegah scroll halaman
            if (e.key === "ArrowUp") selectedItem.y -= 10;
            if (e.key === "ArrowDown") selectedItem.y += 10;
            if (e.key === "ArrowLeft") selectedItem.x -= 10;
            if (e.key === "ArrowRight") selectedItem.x += 10;
            draw();
        }
    }
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background Image or dark fill
    if (bgImageObj) {
        ctx.drawImage(bgImageObj, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Grid (slightly lighter if bg image to remain visible)
    ctx.strokeStyle = bgImageObj ? "rgba(255,255,255,0.1)" : "#222";
    ctx.lineWidth = 1;
    for(let x = 0; x < canvas.width; x += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = 0; y < canvas.height; y += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw Obstacles (Sort: Shapes first to be on bottom layer)
    const sortedObstacles = [...obstacles].sort((a, b) => {
        if (a.type === "shape" && b.type !== "shape") return -1;
        if (a.type !== "shape" && b.type === "shape") return 1;
        return 0;
    });

    sortedObstacles.forEach(obs => {
        ctx.save();
        const angleRad = (obs.angle || 0) * Math.PI / 180;
        const cx = obs.x + obs.w/2;
        const cy = obs.y + obs.h/2;
        
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        
        if (obs.texture) {
            if (obs._textureImg && obs._textureImg.complete && obs._textureImg !== "loading") {
                if (obs.type === "shape") {
                    // Stretched texture for shapes
                    ctx.drawImage(obs._textureImg, -obs.w/2, -obs.h/2, obs.w, obs.h);
                } else {
                    // Tiled texture for walls
                    if (!obs._texturePat) {
                        const offCanvas = document.createElement("canvas");
                        offCanvas.width = 20; 
                        offCanvas.height = 20;
                        const oCtx = offCanvas.getContext("2d");
                        oCtx.drawImage(obs._textureImg, 0, 0, 20, 20);
                        obs._texturePat = ctx.createPattern(offCanvas, 'repeat');
                    }
                    ctx.fillStyle = obs._texturePat;
                    ctx.save();
                    ctx.translate(-obs.w/2, -obs.h/2);
                    ctx.fillRect(0, 0, obs.w, obs.h);
                    ctx.restore();
                }
            } else if (!obs._textureImg) {
                const img = new Image();
                img.onload = () => { obs._textureImg = img; draw(); };
                img.src = obs.texture;
                obs._textureImg = "loading";
            }
        } else {
            ctx.fillStyle = obs.color || (obs.type === "shape" ? "#444444" : "#444");
            ctx.fillRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        }
        
        // Highlight selection
        if (selectedItem === obs) {
            ctx.strokeStyle = "yellow";
            ctx.lineWidth = 4;
            ctx.strokeRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        } else if (!obs.texture && obs.type !== "border" && obs.type !== "shape") {
            ctx.strokeStyle = "cyan";
            ctx.lineWidth = 2;
            ctx.strokeRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        }
        
        ctx.restore();
    });

    // Draw active drawing shape
    if (isDrawing && (currentTool === "wall" || currentTool === "shape")) {
        let w = currentX - startX;
        let h = currentY - startY;
        let x = w < 0 ? currentX : startX;
        let y = h < 0 ? currentY : startY;
        w = Math.abs(w);
        h = Math.abs(h);
        if (w === 0 && currentTool === "wall") w = SNAP_GRID;
        if (h === 0 && currentTool === "wall") h = SNAP_GRID;
        
        const angleInput = document.getElementById("wall-angle");
        const angle = (currentTool === "wall" && angleInput) ? (parseFloat(angleInput.value) || 0) : 0;
        const angleRad = angle * Math.PI / 180;
        const cx = x + w/2;
        const cy = y + h/2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        
        if (currentTool === "wall") {
            ctx.fillStyle = "rgba(0, 255, 255, 0.3)";
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
            ctx.strokeRect(-w/2, -h/2, w, h);
        } else {
            ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(-w/2, -h/2, w, h);
        }
        
        ctx.restore();
    }

    // Draw Towers
    towers.forEach(t => {
        const tx = t.x;
        const ty = t.y;

        // Selection indicator
        if (selectedItem === t) {
            ctx.save();
            ctx.strokeStyle = "yellow";
            ctx.lineWidth = 3;
            ctx.strokeRect(tx - 5, ty - 5, t.size + 10, t.size + 10);
            ctx.restore();
        }

        if (t.texture) {
            if (t._textureImg && t._textureImg.complete && t._textureImg !== "loading") {
                ctx.drawImage(t._textureImg, tx, ty, t.size, t.size);
            } else if (!t._textureImg) {
                const img = new Image();
                img.onload = () => { t._textureImg = img; draw(); };
                img.src = t.texture;
                t._textureImg = "loading";
            }
        } else {
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
        }

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

function removeSelectedItem() {
    if (!selectedItem) return;
    if (selectedItem.type === "border") return;

    let idx = obstacles.indexOf(selectedItem);
    if (idx !== -1) obstacles.splice(idx, 1);

    idx = towers.indexOf(selectedItem);
    if (idx !== -1) towers.splice(idx, 1);

    idx = waypoints.indexOf(selectedItem);
    if (idx !== -1) waypoints.splice(idx, 1);

    idx = playerSpawns.indexOf(selectedItem);
    if (idx !== -1) playerSpawns.splice(idx, 1);

    selectedItem = null;
    draw();
}

// Handle Delete key
window.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Del") && selectedItem) {
        // Prevent accidental deletion if focus is on input
        if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        
        removeSelectedItem();
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
        removeSelectedItem();
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
showWelcomeState();
// draw(); // Don't draw initially as canvas is hidden
