import { Player } from "./player.js";
import { getPlayer1Input } from "../input/inputHandler.js";
import { getPeers } from "../network/webrtc.js";
import { getMyId, sendSync } from "../network/socket.js";
import { obstacles, drawObstacles, getRandomSafePosition, checkObstacleCollision, checkEntityCollision, checkTowerCollision } from "./map.js";
import { Spell } from "./spell.js";
import { Tower } from "./tower.js";
import { Minion } from "./minion.js";
import { Bullet } from "./bullet.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Camera State (Module Scope)
let camX = 0;
let camY = 0;
let camZoom = 0.8;
let lastCamInitialized = false;

// UI & Game State
let lastTime = 0;
let accumulator = 0;
const TIME_STEP = 1000 / 60; // Fixed 60 FPS update
let battleTimeTotal = 300; // default 5 menit
let battleTimeRemaining = 300;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas(); // init pertama


// LOCAL PLAYER
// LOCAL PLAYER
export const player1 = new Player(100, 1100, "lime");

const spells = [];
const floatingTexts = [];
const towers = [];
const minions = [];
let waveNumber = 0;
let waveTimer = 0;

// Sound FX Assets
const soundFx = {
    bullet: new Audio('src/soundfx/bullet.mp3'),
    ultimatum: new Audio('src/soundfx/ultimatum.mp3'),
    speed: new Audio('src/soundfx/speed.mp3'),
    died: new Audio('src/soundfx/died.mp3')
};

// Role Assets
const roleAssets = {
    damager: new Image(),
    tanker: new Image(),
    healer: new Image()
};
roleAssets.damager.src = "src/skills/ultimatum-damager.png";
roleAssets.tanker.src = "src/skills/ultimatum-tanker.png";
roleAssets.healer.src = "src/skills/ultimatum-healer.png";

/**
 * Memainkan suara peluru (cloned agar bisa overlapping saat rapid fire)
 */
export function playBulletSound(isLocal = true) {
    const s = soundFx.bullet.cloneNode();
    s.volume = isLocal ? 0.3 : 0.08; // Musuh lebih pelan
    s.play().catch(() => { }); // Abaikan jika interaksi belum ada
}

/**
 * Memainkan suara laser ultimatum
 */
export function playUltimatumSound(isLocal = true) {
    const s = soundFx.ultimatum.cloneNode(); // Gunakan clone agar bisa simultan jika ada musuh ulti bareng
    s.volume = isLocal ? 0.6 : 0.2;
    s.play().catch(() => { });
}

/**
 * Memainkan suara skill speed boost
 */
export function playSpeedSound(isLocal = true) {
    const s = soundFx.speed.cloneNode();
    s.volume = isLocal ? 0.5 : 0.15;
    s.play().catch(() => { });
}

/**
 * Memainkan suara saat mati (khusus local player)
 */
export function playDiedSound() {
    const s = soundFx.died.cloneNode();
    s.volume = 1.0;
    s.play().catch(() => { });
}

// Sinkronisasi Sound Callbacks ke Player Utama
player1.onShoot = playBulletSound;
player1.onUltimatum = playUltimatumSound;
player1.onDeath = playDiedSound;
let spellTimer = 0;
let isGameOver = false;
let lastPlayerHp = player1.hp; // Untuk deteksi Damage

// STARFIELD (Galaxy Background)
const STARS = [];
for (let i = 0; i < 400; i++) { // More stars for larger map
    STARS.push({
        x: Math.random() * 1800,
        y: Math.random() * 900,
        size: Math.random() * 2 + 0.5,
        twinkle: Math.random() * Math.PI
    });
}

// PARTICLE SYSTEM
const particles = [];

/**
 * Notifikasi global saat ada pemain terbunuh
 */
function showKillNotification(victimName, killerName) {
    if (victimName === player1.name) return;

    const container = document.getElementById("kill-feed-container");
    if (!container) return;

    const killItem = document.createElement("div");
    killItem.className = "kill-item";

    if (killerName === "MINION") {
        killItem.innerHTML = `<span style="color:#ff4757">MINION</span> <span style="opacity:0.6; font-size:10px;">MENUMBANGKAN</span> <span style="color:#00f2fe">${victimName}</span>`;
    } else {
        killItem.innerHTML = `<span style="color:#00f2fe">${killerName}</span> <span style="opacity:0.6; font-size:10px;">MEMBUNUH</span> <span style="color:#ff4757">MINION</span>`;
    }

    container.appendChild(killItem);

    setTimeout(() => {
        if (killItem.parentNode === container) {
            container.removeChild(killItem);
        }
    }, 4500);
}

function createBurst(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            size: Math.random() * 4 + 2,
            color: color,
            life: 1.0
        });
    }
}

/**
 * Membuat percikan api/api kecil saat peluru menabrak tembok
 */
function createSparkBurst(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 12, // Lebih cepat
            vy: (Math.random() - 0.5) * 12,
            size: Math.random() * 3 + 1,  // Lebih kecil
            color: color,
            life: 0.6                      // Lebih singkat
        });
    }
}

export function initGameConfig(duration, players) {
    battleTimeTotal = duration;
    battleTimeRemaining = duration;
    isGameOver = false;
    spellTimer = 0;

    // 1. Bersihkan sisa state pertempuran sebelumnya
    spells.length = 0;
    particles.length = 0;
    floatingTexts.length = 0;

    // 2. WIPE Remote Players secara total untuk cegah duplikasi/kloning
    Object.keys(remotePlayers).forEach(id => {
        delete remotePlayers[id];
    });

    // 3. Reset State Player Lokal
    player1.resetState();

    // 4. Tambahkan player remotes dari data match terbaru
    players.forEach(p => {
        if (p.id !== getMyId()) {
            const remote = getOrCreateRemotePlayer(p.id, p.color, p.name, p.role || "damager");
            remote.resetState();
            remote.role = p.role || "damager";
            remote.isHost = p.isHost;
            remote.team = p.team;
            remote.onShoot = () => playBulletSound(false);
            remote.onUltimatum = () => playUltimatumSound(false);
            remote.onSpeed = () => playSpeedSound(false);
            remote.onBulletHit = createSparkBurst;
        } else {
            player1.name = p.name;
            player1.role = p.role || "damager";
            player1.isHost = p.isHost;
            player1.team = p.team;
            player1.onShoot = () => playBulletSound(true);
            player1.onUltimatum = () => playUltimatumSound(true);
            player1.onSpeed = () => playSpeedSound(true);
            player1.onBulletHit = createSparkBurst;

            // Fix broken UI asset
            const ultBtnImg = document.querySelector("#ult-btn img");
            if (ultBtnImg) {
                ultBtnImg.src = `src/skills/ultimatum-${player1.role}.png`;
            }
        }
    });

    // 5. Initialize Towers
    towers.length = 0;
    // Spread along the 1800px width
    towers.push(new Tower(1500, 450 - 40, 300, 80, "TOWER 1"));  // FRONT
    towers.push(new Tower(800, 450 - 40, 600, 80, "TOWER 2"));   // MIDDLE
    towers.push(new Tower(100, 450 - 40, 1000, 80, "BASE"));     // BASE

    minions.length = 0;
    waveNumber = 0;
    waveTimer = 0;
}

export function setLocalSpawn(x, y, team) {
    player1.x = x;
    player1.y = y;
    player1.startX = x; // Simpan untuk respawn
    player1.startY = y;
    player1.team = team !== undefined ? team : 0;
}

export function setPlayerColor(color) {
    player1.color = color;
}

// REMOTE PLAYERS
const remotePlayers = {};

function checkCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.size &&
        rect1.x + rect1.size > rect2.x &&
        rect1.y < rect2.y + rect2.size &&
        rect1.y + rect1.size > rect2.y
    );
}

function update() {
    if (isGameOver) return;

    const input = getPlayer1Input();
    const allPlayers = [player1, ...Object.values(remotePlayers)];

    // Update Battle Timer
    if (battleTimeRemaining > 0) {
        battleTimeRemaining -= (1 / 60); // Asumsi 60 FPS
        if (battleTimeRemaining <= 0) {
            battleTimeRemaining = 0;
            endGame();
        }
    }

    // Update Spells - Filter inactive
    for (let i = spells.length - 1; i >= 0; i--) {
        spells[i].update();
        if (!spells[i].active) spells.splice(i, 1);
    }

    if (player1.isHost) { // Hanya Host yang boleh spawn spell & wave
        spellTimer++;
        if (spellTimer >= 120) { // 2 detik (60 FPS)
            spawnRandomSpell();
            spellTimer = 0;
        }

        waveTimer++;

        // Fast-forward: jika wave sudah pernah spawn (waveNumber > 0) dan minion sudah habis,
        // langsung skip ke 3 detik terakhir (720 frames). 
        // Jangan trigger sebelum wave pertama agar player bisa farming 15 detik pertama.
        if (waveNumber > 0 && minions.length === 0 && waveTimer < 720) {
            waveTimer = 720;
        }

        if (waveTimer >= 900) { // 15 detik (60 FPS)
            spawnWave();
            waveTimer = 0;
        }
    }

    // Sync-Check Spells secara Global: Hapus spell yang telah diambil oleh siapa pun
    allPlayers.forEach(p => {
        if (p.consumedSpellIds && p.consumedSpellIds.length > 0) {
            p.consumedSpellIds.forEach(id => {
                const idx = spells.findIndex(s => s.id === id);
                if (idx !== -1) {
                    spells.splice(idx, 1);
                }
            });
        }
    });

    // 2. update local player (cek tembok + tower)
    const nextX = player1.x + input.x * player1.speed;
    const nextY = player1.y + input.y * player1.speed;

    // Bounding box simulasi posisi berikutnya
    const futureRect = { x: nextX, y: nextY, size: player1.size };

    const collidedWall = checkObstacleCollision(futureRect);
    const collidedTower = checkEntityCollision(futureRect, towers);

    if (!collidedWall && !collidedTower) {
        player1.update(input, allPlayers, towers, minions);
    } else {
        // Sliding logic: Coba gerak hanya di sumbu X jika Y ketabrak, atau sebaliknya
        const rectX = { x: nextX, y: player1.y, size: player1.size };
        if (!checkObstacleCollision(rectX) && !checkEntityCollision(rectX, towers)) {
            player1.update({ ...input, y: 0 }, allPlayers, towers, minions);
        } else {
            const rectY = { x: player1.x, y: nextY, size: player1.size };
            if (!checkObstacleCollision(rectY) && !checkEntityCollision(rectY, towers)) {
                player1.update({ ...input, x: 0 }, allPlayers, towers, minions);
            } else {
                player1.update({ ...input, x: 0, y: 0 }, allPlayers, towers, minions);
            }
        }
    }

    // Update Towers (Animation)
    towers.forEach(t => t.update());

    // Deteksi Hit/Damage untuk efek Vignette
    if (player1.hp < lastPlayerHp && player1.isAlive) {
        triggerHitEffect();
    }
    lastPlayerHp = player1.hp;

    // Laser Check (Ultimatum) - Cek semua pemain yang menyalakan laser
    allPlayers.forEach(p => {
        if (p.ultActive > 0) {
            checkLaserHit(p, allPlayers);
        }
    });

    // Respawn check
    if (!player1.isAlive && player1.respawnTimer <= 0) {
        // Smart Respawn: Cari lokasi paling jauh dari musuh yang hidup
        const safest = getSafestSpawnPoint();
        player1.respawn(safest.x, safest.y, towers);
    }

    // update remote players
    Object.values(remotePlayers).forEach(p => {
        if (p.lastInput) {
            p.update(p.lastInput, allPlayers, towers); // simulasi gerakan searah (dead reckoning)
        }
        if (p.targetX !== undefined) {
            // Koreksi posisi dengan LERP (Linear Interpolation)
            p.x += (p.targetX - p.x) * 0.3;
            p.y += (p.targetY - p.y) * 0.3;
        }
    });

    // Update Minions
    const activeTower = towers.find(t => t.hp > 0);
    for (let i = minions.length - 1; i >= 0; i--) {
        const m = minions[i];
        m.update(activeTower, allPlayers, player1.isHost);
        if (m.hp <= 0) {
            m.isAlive = false;
            createBurst(m.x + m.size / 2, m.y + m.size / 2, m.color);
            minions.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].y -= 1;
        floatingTexts[i].life -= 0.02;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }

    // kirim ke semua peer (WebRTC)
    const peers = getPeers();

    const payloadStr = JSON.stringify({
        id: getMyId(),
        input: input,
        state: {
            x: player1.x,
            y: player1.y,
            hp: player1.hp,
            color: player1.color,
            energy: player1.energy,
            isAlive: player1.isAlive,
            respawnTimer: player1.respawnTimer,
            team: player1.team,
            score: player1.score,
            bulletPower: player1.bulletPower,
            role: player1.role,
            ultActive: player1.ultActive,
            shieldTimer: player1.shieldTimer,
            battleTimeRemaining: battleTimeRemaining,
            waveTimer: waveTimer,
            consumedSpellIds: player1.consumedSpellIds,
            playerHps: player1.isHost ? allPlayers.reduce((acc, p) => { acc[p.id] = p.hp; return acc; }, {}) : null,
            spells: player1.isHost ? spells.map(s => ({
                id: s.id, x: s.x, y: s.y, type: s.type, lifetime: s.lifetime
            })) : null,
            isGameOver: isGameOver,
            minions: player1.isHost ? minions.map(m => ({
                id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, color: m.color, wave: m.wave, isKing: m.isKing,
                ultActive: m.ultActive,
                lastDirX: m.lastDir.x, lastDirY: m.lastDir.y,
                bullets: (m.bullets || []).map(b => ({
                    id: b.id, x: b.x, y: b.y, dx: b.dx, dy: b.dy, power: b.power, color: b.color || b.getColor()
                }))
            })) : null,
            towers: player1.isHost ? towers.map(t => ({
                hp: t.hp
            })) : null
        }
    });

    let webrtcSentCount = 0;
    Object.values(peers).forEach(({ channel }) => {
        if (channel && channel.readyState === "open") {
            channel.send(payloadStr);
            webrtcSentCount++;
        }
    });

    // FALLBACK HYBRID: Jika WebRTC belum terbuka / terblokir NAT, gunakan jalur Socket.IO
    if (webrtcSentCount !== Object.keys(peers).length && Object.keys(peers).length > 0) {
        sendSync(payloadStr);
    }

    // Collision: Player Bullets -> Minions
    allPlayers.forEach(p => {
        p.bullets.forEach(b => {
            if (!b.active) return;
            minions.forEach(m => {
                if (checkCollision(b, m)) {
                    b.active = false;
                    m.hp -= b.damage;
                    floatingTexts.push({
                        x: m.x + m.size / 2, y: m.y, text: `-${Math.round(b.damage)}`, color: "#f1c40f", life: 0.8
                    });
                    if (m.hp <= 0) {
                        p.score++;
                    }
                }
            });
        });

        // Player Laser -> Minions (Only for Damager role)
        if (p.ultActive > 0 && p.role === "damager") {
            minions.forEach(m => {
                if (checkLaserHitEntity(p, m)) {
                    m.hp -= 2; // Damage per frame while laser touches minion
                    if (Math.random() > 0.9) {
                        floatingTexts.push({ x: m.x + m.size / 2, y: m.y, text: "ULT!", color: "#9b59b6", life: 0.8 });
                    }
                    if (m.hp <= 0) p.score++;
                }
            });
        }

        // --- HEALER ULTIMATUM logic ---
        // If anyone is near a casting Healer, they get healed
        if (p.isAlive && p.hp < p.maxHp) {
            const isUnderHealerBarrier = allPlayers.some(heal => 
                heal.isAlive && 
                heal.role === "healer" && 
                heal.ultActive > 0 && 
                Math.hypot(p.x - heal.x, p.y - heal.y) < 180
            );
            if (isUnderHealerBarrier) {
                p.hp = Math.min(p.maxHp, p.hp + 0.5); // Meningkat jadi ~30 HP/sec
                if (Math.random() > 0.95) {
                    floatingTexts.push({ x: p.x + p.size / 2, y: p.y, text: "+HEAL", color: "#2ed573", life: 0.5 });
                }
            }
        }
    });

    // Collision: Minion Bullets -> Towers & Players
    minions.forEach(m => {
        m.bullets.forEach(b => {
            if (!b.active) return;
            // Target Players
            allPlayers.forEach(p => {
                if (!p.isAlive) return;

                if (p.shieldTimer > 0 && checkCollision(b, p)) {
                    // Shield absorbs bullet — dramatic block effect!
                    b.active = false;
                    const bx = b.x + b.size / 2;
                    const by = b.y + b.size / 2;
                    for (let i = 0; i < 10; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const spd = Math.random() * 5 + 2;
                        particles.push({ x: bx, y: by, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, size: Math.random()*3+1, color: "#00ffff", life: 0.9 });
                    }
                    floatingTexts.push({ x: p.x + p.size/2, y: p.y - 5, text: "SHIELD!", color: "#00ffff", life: 0.7 });
                    return;
                }

                // --- TANKER PROTECTION logic ---
                const isUnderTankerBarrier = allPlayers.some(tank => 
                    tank.isAlive && 
                    tank.role === "tanker" && 
                    tank.ultActive > 0 && 
                    Math.hypot(p.x - tank.x, p.y - tank.y) < 180
                );
                if (isUnderTankerBarrier) return; // Immune!

                if (!p.isAlive || p.shieldTimer > 0) return;

                if (checkCollision(b, p)) {
                    b.active = false;
                    p.hp -= b.damage;
                    if (p.hp <= 0) p.die({ name: "MINION" });
                }
            });
            // Target Towers
            towers.forEach(t => {
                if (t.hp > 0 && checkCollision(b, t)) {
                    b.active = false;
                    t.hp -= b.damage;
                }
            });
        });
 
        // KING BOSS LASER DAMAGE (Players only - not towers)
        if (m.isKing && m.ultActive > 0) {
            allPlayers.forEach(p => {
                if (!p.isAlive) return;

                // Shield blocks King laser too — with dramatic effect
                if (p.shieldTimer > 0 && checkLaserHitEntity(m, p)) {
                    if (Math.random() > 0.6) {
                        const angle = Math.random() * Math.PI * 2;
                        const r = p.size * 1.4;
                        particles.push({ x: p.x+p.size/2 + Math.cos(angle)*r, y: p.y+p.size/2 + Math.sin(angle)*r, vx: Math.cos(angle)*3, vy: Math.sin(angle)*3, size: Math.random()*3+1, color: "#00ffff", life: 0.8 });
                    }
                    return;
                }

                const isUnderTankerBarrier = allPlayers.some(tank => 
                    tank.isAlive && tank.role === "tanker" && tank.ultActive > 0 && 
                    Math.hypot(p.x - tank.x, p.y - tank.y) < 180
                );
                if (isUnderTankerBarrier) return;
 
                if (checkLaserHitEntity(m, p)) {
                    p.hp -= 1.5;
                    if (p.hp <= 0) p.die({ name: "KING BOSS" });
                    if (Math.random() > 0.7) {
                        floatingTexts.push({ x: p.x + p.size / 2, y: p.y - 10, text: `⚡LASER`, color: "#f1c40f", life: 0.6 });
                    }
                }
            });
            // NOTE: King Boss does NOT damage towers (only targets players)
        }
    });

    // Check Tower Death / Sequential Unlock
    if (towers.every(t => t.hp <= 0)) {
        endGame(false); // Defeat
    }

    // Spell Collision
    for (let i = spells.length - 1; i >= 0; i--) {
        const s = spells[i];
        if (checkCollision({ x: s.x, y: s.y, size: s.size }, player1)) {
            let pColor = "#fff";
            if (s.type === 'HP') pColor = "#2ecc71";
            if (s.type === 'ENERGY') pColor = "#f1c40f";
            if (s.type === 'POWER') pColor = "#e74c3c";
            createBurst(s.x + s.size / 2, s.y + s.size / 2, pColor);

            applySpell(player1, s);
            player1.consumedSpellIds.push(s.id); // Catat ID yang dimakan
            spells.splice(i, 1);
        }
    }
}

function getLaserDistance(shooter, maxLen) {
    let finalLen = maxLen;
    const sx = shooter.x + shooter.size / 2;
    const sy = shooter.y + shooter.size / 2;
    let { x: dx, y: dy } = shooter.lastDir;

    // Normalize direction
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return 0;
    const ndx = dx / mag;
    const ndy = dy / mag;

    for (const obs of obstacles) {
        let tmin = -Infinity;
        let tmax = Infinity;

        // X axis Slab
        if (ndx !== 0) {
            let t1 = (obs.x - sx) / ndx;
            let t2 = (obs.x + obs.w - sx) / ndx;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (sx < obs.x || sx > obs.x + obs.w) continue;

        // Y axis Slab
        if (ndy !== 0) {
            let t1 = (obs.y - sy) / ndy;
            let t2 = (obs.y + obs.h - sy) / ndy;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (sy < obs.y || sy > obs.y + obs.h) continue;

        if (tmax >= tmin && tmax > 0) {
            // Hit detected
            const hitT = tmin > 0 ? tmin : 0;
            if (hitT < finalLen) finalLen = hitT;
        }
    }
    return finalLen;
}

function checkLaserHit(shooter, players) {
    // FFA/PvP Player damage disabled for COOP Tower Defense
    // Minion damage is handled separately via checkLaserHitEntity
}

function endGame(isTimeUp = true) {
    isGameOver = true;
    const overlay = document.getElementById("game-over-overlay");
    const winnerDisplay = document.getElementById("winner-text");
    const endTitle = document.getElementById("end-title");

    overlay.style.display = "flex";

    if (isTimeUp) {
        endTitle.innerText = "DEFENSE SUCCESS!";
        winnerDisplay.innerText = "KAMU BERHASIL BERTAHAN!";
        winnerDisplay.style.color = "#00f2fe";
    } else {
        endTitle.innerText = "GAME OVER";
        winnerDisplay.innerText = "SEMUA TOWER HANCUR!";
        winnerDisplay.style.color = "#ff4757";
    }
}

function spawnRandomSpell() {
    // 50% Energy, 25% HP, 25% Power
    const types = ['ENERGY', 'ENERGY', 'HP', 'POWER'];
    const type = types[Math.floor(Math.random() * types.length)];

    let pos;
    let safe = false;
    let tries = 0;
    while (!safe && tries < 20) {
        pos = getRandomSafePosition(20);
        // Cek jarak dari spell lain + cek posisi tower
        const tooClose = spells.some(s => Math.sqrt((s.x - pos.x) ** 2 + (s.y - pos.y) ** 2) < 150);
        const nearTower = checkEntityCollision({ x: pos.x, y: pos.y, size: 20 }, towers);

        if (!tooClose && !nearTower) safe = true;
        tries++;
    }

    spells.push(new Spell(pos.x, pos.y, type));
    console.log("Spell Spawned by Host:", type, pos);
}

function applySpell(player, spell) {
    if (spell.type === 'HP') player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.1);
    if (spell.type === 'ENERGY') player.energy = Math.min(player.maxEnergy, player.energy + player.maxEnergy * 0.1);
    if (spell.type === 'POWER') {
        if (player.role === "damager") {
            player.bulletPower += 0.5; // Stacking incremental
            if (player === player1) triggerAtkAnimation();
        }
    }
}

function triggerAtkAnimation() {
    const hud = document.getElementById("stat-hud");
    if (!hud) return;
    hud.classList.add("atk-pop");
    setTimeout(() => {
        hud.classList.remove("atk-pop");
    }, 400);
}

function findSafestSpawnPoint() {
    const spawnPoints = [
        { x: 100, y: 100 }, { x: 1700, y: 100 },
        { x: 100, y: 800 }, { x: 1700, y: 800 },
        { x: 900, y: 100 }, { x: 900, y: 800 },
        { x: 100, y: 450 }, { x: 1700, y: 450 }
    ];

    const allAlivePlayers = [player1, ...Object.values(remotePlayers)].filter(p => p.isAlive);
    
    // Filter out spawn points that are currently blocked by a Tower
    const validPoints = spawnPoints.filter(pt => !checkTowerCollision({ ...pt, size: 25 }, towers));

    const candidates = validPoints.length > 0 ? validPoints : spawnPoints;

    if (allAlivePlayers.length === 0) return candidates[Math.floor(Math.random() * candidates.length)];

    let bestPoint = candidates[0];
    let maxDistToNearest = -1;

    candidates.forEach(point => {
        let minDistToThisPoint = Infinity;
        allAlivePlayers.forEach(p => {
            const d = Math.sqrt((point.x - p.x) ** 2 + (point.y - p.y) ** 2);
            if (d < minDistToThisPoint) minDistToThisPoint = d;
        });

        if (minDistToThisPoint > maxDistToNearest) {
            maxDistToNearest = minDistToThisPoint;
            bestPoint = point;
        }
    });

    return bestPoint;
}

// Shortcut alias
const getSafestSpawnPoint = findSafestSpawnPoint;

function triggerHitEffect() {
    const v = document.getElementById("hit-vignette");
    if (!v) return;
    v.classList.add("hit-flash");
    setTimeout(() => {
        v.classList.remove("hit-flash");
    }, 200);
}

function updateLowHPEffect() {
    const v = document.getElementById("hit-vignette");
    if (!v) return;
    if (player1.isAlive && player1.hp > 0 && player1.hp <= player1.maxHp * 0.2) {
        v.classList.add("low-hp-pulse");
    } else {
        v.classList.remove("low-hp-pulse");
    }
}

function updateUI() {
    // Scoreboard Horizontal Cooperative
    const scoreList = document.getElementById("scoreboard-list");
    if (scoreList) {
        const allPlayers = [player1, ...Object.values(remotePlayers)];
        const sorted = allPlayers.sort((a, b) => b.score - a.score);

        scoreList.innerHTML = `
            <div class="score-item" style="border-color: #00f2fe; background: rgba(0, 242, 254, 0.1);">
                <span class="score-name" style="color: #00f2fe;">WAVE:</span>
                <span class="score-val">${waveNumber}</span>
            </div>
        ` + sorted.map(p => `
            <div class="score-item">
                <span class="score-name">${p.name}:</span>
                <span class="score-val">${p.score}</span>
            </div>
        `).join("");
    }

    // --- WAVE COOLDOWN UI ---
    const waveTimerHUD = document.getElementById("wave-timer-val");
    if (waveTimerHUD) {
        const remainingFrames = Math.max(0, 900 - waveTimer);
        const remainingSec = Math.ceil(remainingFrames / 60);
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        waveTimerHUD.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // Visual warning if wave is imminent (last 3 seconds)
        if (remainingSec <= 3) {
            waveTimerHUD.style.color = "#ff4757";
            waveTimerHUD.style.textShadow = "0 0 15px rgba(255, 71, 87, 0.8)";
        } else {
            waveTimerHUD.style.color = "#00f2fe";
            waveTimerHUD.style.textShadow = "0 0 10px rgba(0, 242, 254, 0.5)";
        }
    }

    // --- LOW HP EFFECT ---
    updateLowHPEffect();

    // Timer
    const mins = Math.floor(battleTimeRemaining / 60);
    const secs = Math.floor(battleTimeRemaining % 60);
    document.getElementById("battle-timer").innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    // Stats
    const atkVal = document.getElementById("atk-value");
    if (atkVal) atkVal.innerText = player1.bulletPower.toFixed(1);

    // Ultimatum Cooldown
    const cdUlt = document.getElementById("cd-ult");
    const ultBtn = document.getElementById("ult-btn");
    if (player1.ultCooldown > 0) {
        cdUlt.style.display = "flex";
        cdUlt.innerText = Math.ceil(player1.ultCooldown / 60);
        ultBtn.style.opacity = "0.5";
    } else {
        cdUlt.style.display = "none";
        ultBtn.style.opacity = player1.energy < 40 ? "0.3" : "1";
    }

    // Shoot Button Energy Feedback
    const shootBtn = document.getElementById("shoot-btn");
    shootBtn.style.opacity = player1.energy < 2 ? "0.3" : "1";

    // Speed Button Energy Feedback
    const speedBtn = document.getElementById("speed-btn");
    if (speedBtn) {
        if (player1.speedCooldown > 0) {
            speedBtn.style.opacity = "0.5";
        } else {
            speedBtn.style.opacity = player1.energy < 20 ? "0.3" : "1";
        }
    }

    // Respawn Msg & Darkness Effect
    const respawnMsg = document.getElementById("respawn-msg");
    const killerInfo = document.getElementById("killer-info");
    const killerDisplay = document.getElementById("killer-name-display");
    const deathOverlay = document.getElementById("death-overlay");

    if (!player1.isAlive && !isGameOver) {
        respawnMsg.style.display = "block";
        document.getElementById("respawn-timer").innerText = Math.ceil(player1.respawnTimer / 60);
        if (deathOverlay) deathOverlay.style.opacity = "1";

        // Tampilkan info pembunuh
        if (killerInfo && player1.killer) {
            killerInfo.style.display = "block";
            killerDisplay.innerText = player1.killer.name;
        }
    } else {
        respawnMsg.style.display = "none";
        if (killerInfo) killerInfo.style.display = "none";
        // Saat game over, biarkan overlay tetap gelap jika player mati, 
        // tapi jika ingin bersih total, set opacity 0
        if (deathOverlay) deathOverlay.style.opacity = (isGameOver && !player1.isAlive) ? "0.8" : (player1.isAlive ? "0" : "1");

        // Revisi: Sesuai issue nyantol, kita sembunyikan semua jika gameover
        if (isGameOver) {
            respawnMsg.style.display = "none";
            if (killerInfo) killerInfo.style.display = "none";
        }
    }

    // Teammate Down Banner (visible to everyone except the victim)
    // Throttled: only update DOM every ~30 frames to avoid frame drops
    if (!window._bannerThrottle) window._bannerThrottle = 0;
    window._bannerThrottle++;
    if (window._bannerThrottle >= 30) {
        window._bannerThrottle = 0;
        const teammateBanner = document.getElementById("teammate-down-banner");
        if (teammateBanner) {
            const deadTeammates = Object.values(remotePlayers).filter(p => !p.isAlive && p.respawnTimer > 0);
            if (deadTeammates.length > 0 && player1.isAlive && !isGameOver) {
                teammateBanner.style.display = "flex";
                teammateBanner.innerHTML = deadTeammates.map(p => {
                    const secs = Math.ceil(p.respawnTimer / 60);
                    return `<div class="teammate-down-item"><span class="skull">\u{1F480}</span>${p.name || "ALLY"} TUMBANG \u2014 <span class="cd">${secs}s</span></div>`;
                }).join("");
            } else {
                teammateBanner.style.display = "none";
            }
        }
    }

    const cdSpeed = document.getElementById("cd-speed");
    if (cdSpeed) {
        if (player1.speedCooldown > 0) {
            cdSpeed.style.display = "flex";
            cdSpeed.innerText = Math.ceil(player1.speedCooldown / 60);
        } else {
            cdSpeed.style.display = "none";
        }
    }

    const cdShield = document.getElementById("cd-shield");
    if (cdShield) {
        if (player1.shieldCooldown > 0) {
            cdShield.style.display = "flex";
            cdShield.innerText = Math.ceil(player1.shieldCooldown / 60);
        } else {
            cdShield.style.display = "none";
        }
    }

    const cdShoot = document.getElementById("cd-shoot");
    if (cdShoot) {
        if (player1.cooldown > 0) {
            cdShoot.style.display = "flex";
            cdShoot.innerText = "";
        } else {
            cdShoot.style.display = "none";
        }
    }
}

function draw() {
    updateUI();
    const allPlayers = [player1, ...Object.values(remotePlayers)];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // LOGIKA KAMERA (KILL CAM)
    let targetX, targetY, targetZoom;

    if (player1.isAlive) {
        targetX = player1.x + player1.size / 2;
        targetY = player1.y + player1.size / 2;
        targetZoom = 0.8;
    } else if (player1.killer && typeof player1.killer.x === 'number') {
        // IKUTI PEMBUNUH (Hanya jika memiliki koordinat)
        targetX = player1.killer.x + player1.killer.size / 2;
        targetY = player1.killer.y + player1.killer.size / 2;
        targetZoom = 1.1; // Zoom sedikit lebih dekat
    } else {
        // Tetap di tempat terakhir player jika tidak ada pembunuh valid
        targetX = player1.x + player1.size / 2;
        targetY = player1.y + player1.size / 2;
        targetZoom = 0.8;
    }

    // Sanity check to avoid NaN
    if (isNaN(targetX) || isNaN(targetY)) {
        targetX = player1.x + player1.size / 2;
        targetY = player1.y + player1.size / 2;
    }

    // Inisialisasi awal agar tidak "terbang" dari (0,0) di awal game
    if (!lastCamInitialized) {
        camX = targetX;
        camY = targetY;
        lastCamInitialized = true;
    }

    // LERP (Smooth Camera) - Factor 0.1 biar dramatis meluncurnya
    const lerpFactor = 0.08;
    camX += (targetX - camX) * lerpFactor;
    camY += (targetY - camY) * lerpFactor;
    camZoom += (targetZoom - camZoom) * lerpFactor;

    ctx.save();

    // Posisikan Kamera & Zoom berdasarkan variabel LERP
    ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-camX, -camY);

    // DRAW STARS (Galaxy Background)
    ctx.fillStyle = "white";
    STARS.forEach(s => {
        const twinkleAlpha = 0.5 + Math.sin(Date.now() * 0.005 + s.twinkle) * 0.5;
        ctx.globalAlpha = twinkleAlpha;
        // Optimization: fillRect is much faster than arc for tiny stars
        ctx.fillRect(s.x, s.y, s.size * 2, s.size * 2);
    });
    ctx.globalAlpha = 1.0;

    // Gambar Neon Grid (Optimasi: Single path)
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 255, 255, 0.08)";
    ctx.beginPath();
    for (let i = 0; i <= 1800; i += 100) {
        ctx.moveTo(i, 0); ctx.lineTo(i, 900);
    }
    for (let j = 0; j <= 900; j += 100) {
        ctx.moveTo(0, j); ctx.lineTo(1800, j);
    }
    ctx.stroke();

    // Gambar Batas Map / Dinding Ujung
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, 1800, 900);

    // Render Towers
    towers.forEach(t => t.draw(ctx));

    // Render Minions
    minions.forEach(m => m.draw(ctx));

    // Render Spells
    spells.forEach(s => s.draw(ctx));

    // Render Laser Ultimatum
    allPlayers.forEach(p => {
        if (p.ultActive > 0) {
            drawUltimatum(ctx, p);
        }
    });
    // Render Minion Boss Laser
    minions.forEach(m => {
        if (m.isKing && m.ultActive > 0) {
            drawUltimatum(ctx, m);
        }
    });

    // Render Particles (Optimasi: Remove save/restore and explicit shadowBlur)
    ctx.shadowBlur = 0;
    particles.forEach(p => {
        ctx.globalAlpha = p.life < 0 ? 0 : p.life;
        ctx.fillStyle = p.color;
        // Optimization: Draw particles as small rectangles rather than arcs for massive performance boost
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    });
    ctx.globalAlpha = 1.0;

    // Render Obstacles 3D Effect
    drawObstacles(ctx);

    // Render Floating Texts
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color || "#e74c3c";
        ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1.0;

    // Render Respawn Timer atas pemain mati (Sudah ada di overlay HTML)
    /*
    if (!player1.isAlive) {
        ctx.fillStyle = "white";
        ctx.font = "bold 20px Arial";
        ctx.fillText(Math.ceil(player1.respawnTimer / 60), player1.x + player1.size / 2, player1.y + player1.size / 2);
    }
    */

    // gambar local player
    player1.draw(ctx);

    // gambar semua remote player
    Object.values(remotePlayers).forEach(p => p.draw(ctx));

    // Draw Target Crosshair (POV Local Player) - IN WORLD SPACE
    if (player1.currentTarget && player1.isAlive) {
        drawTargetCrosshair(ctx, player1.currentTarget);
    }

    ctx.restore();

    // GAMBAR MINIMAP (UI Layer)
    drawMinimap(ctx);
}

function drawMinimap(ctx) {
    const mapSizeW = 150; // Larger for rectangle
    const mapSizeH = 75;
    const scale = mapSizeW / 1800;
    // Posisikan Minimap wajar (Kanan Atas)
    const mapX = window.innerWidth - mapSizeW - 20;
    const mapY = 20;

    // Background Minimap Transparan
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(mapX, mapY, mapSizeW, mapSizeH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.strokeRect(mapX, mapY, mapSizeW, mapSizeH);

    // Rintangan (Grey)
    ctx.fillStyle = "rgba(150, 150, 150, 0.4)";
    obstacles.forEach(obs => {
        ctx.fillRect(mapX + obs.x * scale, mapY + obs.y * scale, obs.w * scale, obs.h * scale);
    });

    // Towers (Blue/White dots)
    towers.forEach(t => {
        if (t.opacity <= 0) return;
        ctx.fillStyle = t.hp > 0 ? "#00f2fe" : "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.arc(mapX + (t.x + t.size / 2) * scale, mapY + (t.y + t.size / 2) * scale, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Minions (Red dots)
    minions.forEach(m => {
        ctx.fillStyle = "#ff4757";
        ctx.beginPath();
        ctx.arc(mapX + (m.x + m.size / 2) * scale, mapY + (m.y + m.size / 2) * scale, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    // Lawan (Warna Dinamis)
    Object.values(remotePlayers).forEach(p => {
        if (!p.isAlive) return; // FIX: Pemain mati jangan muncul di minimap
        ctx.fillStyle = p.color || "red";
        ctx.beginPath();
        ctx.arc(mapX + (p.x + p.size / 2) * scale, mapY + (p.y + p.size / 2) * scale, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Diri Sendiri (Warna Dinamis POV)
    if (player1.isAlive) {
        ctx.fillStyle = player1.color;
        ctx.beginPath();
        ctx.arc(mapX + (player1.x + player1.size / 2) * scale, mapY + (player1.y + player1.size / 2) * scale, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let deltaTime = timestamp - lastTime;

    // CAP FPS ke 60: Jika waktu sejak frame terakhir kurang dari ~16ms, skip.
    // Ini membantu di monitor 144Hz/240Hz agar pergerakan tidak terasa "blur" atau terlalu cepat.
    if (deltaTime < 15.8) {
        requestAnimationFrame(gameLoop);
        return;
    }

    lastTime = timestamp;

    // Jika browser tab ditinggal (minimize), cegah tumpukan waktu menggila
    if (deltaTime > 250) deltaTime = 250;

    accumulator += deltaTime;

    while (accumulator >= TIME_STEP) {
        update();
        accumulator -= TIME_STEP;
    }

    draw();
    
    // Toggle Action Buttons visibility based on player state
    const actionButtons = document.querySelector(".action-buttons");
    if (actionButtons) {
        actionButtons.style.display = (player1.isAlive && !isGameOver) ? "flex" : "none";
    }

    requestAnimationFrame(gameLoop);
}

function drawUltimatum(ctx, p) {
    const sx = p.x + p.size / 2;
    const sy = p.y + p.size / 2;

    if (p.role === "tanker" || p.role === "healer") {
        const isTanker = p.role === "tanker";
        const color = isTanker ? "255, 165, 2" : "46, 213, 115";
        const baseRadius = 180;
        
        // Efek Denyut (Pulse)
        const pulse = Math.sin(Date.now() / 150) * 8;
        const radius = baseRadius + pulse;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        
        // Background Gradient
        const grad = ctx.createRadialGradient(sx, sy, radius * 0.5, sx, sy, radius);
        grad.addColorStop(0, `rgba(${color}, 0.05)`);
        grad.addColorStop(1, `rgba(${color}, 0.15)`);
        ctx.fillStyle = grad;
        ctx.fill();
        
        // Border
        ctx.strokeStyle = `rgba(${color}, 0.8)`;
        ctx.lineWidth = 3;
        if (isTanker) ctx.setLineDash([10, 5]);
        ctx.stroke();
        
        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = `rgb(${color})`;
        ctx.stroke();
        ctx.restore();

        // Partikel di pinggiran (hanya jika p adalah player1 untuk cegah overkill lokal, 
        // atau jalankan untuk semua tapi dengan probability rendah)
        if (Math.random() > 0.8) {
            const angle = Math.random() * Math.PI * 2;
            const px = sx + Math.cos(angle) * radius;
            const py = sy + Math.sin(angle) * radius;
            particles.push({
                x: px,
                y: py,
                vx: (px - sx) * 0.02, // Gerak keluar lambat
                vy: (py - sy) * 0.02,
                size: Math.random() * 3 + 1,
                color: `rgb(${color})`,
                life: 1.0
            });
        }
    } else {
        // DEFAULT: DAMAGER / KING BOSS LASER
        let { x: dx, y: dy } = p.lastDir;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0) { dx /= mag; dy /= mag; }

        let length = getLaserDistance(p, 600);

        // KING BOSS: Clip laser at nearest player hit point
        if (p.isKing) {
            const allPlayers = [player1, ...Object.values(remotePlayers)];
            allPlayers.forEach(target => {
                if (!target.isAlive) return;
                const tdx = (target.x + target.size / 2) - sx;
                const tdy = (target.y + target.size / 2) - sy;
                const dot = tdx * dx + tdy * dy;
                if (dot < 0) return;

                const projX = sx + dot * dx;
                const projY = sy + dot * dy;
                const perpDist = Math.sqrt((target.x + target.size/2 - projX) ** 2 + (target.y + target.size/2 - projY) ** 2);

                if (perpDist < target.size + 8 && dot < length) {
                    length = Math.max(0, dot - target.size);
                }
            });
        }

        const isKingColor = p.isKing;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dx * length, sy + dy * length);

        ctx.strokeStyle = isKingColor ? "#fff7aa" : "white";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.lineWidth = isKingColor ? 12 : 15;
        ctx.shadowBlur = 20;
        ctx.shadowColor = isKingColor ? "#f1c40f" : "purple";
        ctx.stroke();

        const sparkColor = isKingColor ? "rgba(241, 196, 15, 0.9)" : "rgba(155, 89, 182, 0.8)";
        if (Math.random() > 0.4) {
            createSparkBurst(sx + dx * length, sy + dy * length, sparkColor);
        }
        ctx.restore();
    }
}


function drawTargetCrosshair(ctx, target) {
    const cx = target.x + target.size / 2;
    const cy = target.y + target.size / 2;
    const size = target.size + 15;
    const time = Date.now() / 200;
    const offset = Math.sin(time) * 3;

    ctx.save();
    ctx.strokeStyle = "#00f2fe";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00f2fe";

    // Draw 4 corners
    const corners = [
        { x: -1, y: -1 }, { x: 1, y: -1 },
        { x: 1, y: 1 }, { x: -1, y: 1 }
    ];

    corners.forEach(c => {
        ctx.beginPath();
        const sx = cx + c.x * (size + offset);
        const sy = cy + c.y * (size + offset);
        
        ctx.moveTo(sx, sy - c.y * 10);
        ctx.lineTo(sx, sy);
        ctx.lineTo(sx - c.x * 10, sy);
        ctx.stroke();
    });

    // Sub-crosshair center
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// buat / ambil player remote
function getOrCreateRemotePlayer(id, color, name, role) {
    if (!remotePlayers[id]) {
        remotePlayers[id] = new Player(300, 300, color || "red", name, role || "damager");
    }
    return remotePlayers[id];
}

// dipanggil dari WebRTC
export function handleRemoteInput(id, input, state) {
    if (id === getMyId()) return;

    const player = getOrCreateRemotePlayer(id, state ? state.color : null, state ? state.name : null, state ? state.role : null);

    if (state) {
        if (state.color) player.color = state.color;
        // Inisialisasi awal target target jika baru connect
        if (player.targetX === undefined) {
            player.x = state.x;
            player.y = state.y;
        }

        player.targetX = state.x;
        player.targetY = state.y;

        if (state.hp !== undefined) player.hp = state.hp;
        if (state.energy !== undefined) player.energy = state.energy;
        if (state.isAlive !== undefined) player.isAlive = state.isAlive;
        if (state.respawnTimer !== undefined) player.respawnTimer = state.respawnTimer;
        if (state.team !== undefined) player.team = state.team;
        if (state.score !== undefined) player.score = state.score;
        if (state.bulletPower !== undefined) player.bulletPower = state.bulletPower;
        if (state.role !== undefined) player.role = state.role;
        if (state.ultActive !== undefined) {
            // Detect ultimatum activation: transition from 0 -> >0
            if (state.ultActive > 0 && player.ultActive === 0 && player.onUltimatum) {
                player.onUltimatum();
            }
            player.ultActive = state.ultActive;
        }
        // Sync shieldTimer so all clients render the shield visual
        if (state.shieldTimer !== undefined) player.shieldTimer = state.shieldTimer;
        if (state.consumedSpellIds !== undefined) player.consumedSpellIds = state.consumedSpellIds;

        // Sync Towers (HANYA DARI HOST)
        if (state.towers && player.isHost) {
            state.towers.forEach((st, i) => {
                if (towers[i]) towers[i].hp = st.hp;
            });
        }

        // Sync Minions (HANYA DARI HOST)
        if (state.minions && player.isHost) {
            const receivedMinions = state.minions;

            // 1. Update existing/New
            receivedMinions.forEach(sm => {
                let m = minions.find(minion => minion.id === sm.id);
                if (m) {
                    // Update stats & target pos
                    m.targetX = sm.x;
                    m.targetY = sm.y;
                    m.hp = sm.hp;

                    // Sync King Boss laser state so clients can render it
                    if (sm.ultActive !== undefined) m.ultActive = sm.ultActive;
                    if (sm.lastDirX !== undefined) m.lastDir = { x: sm.lastDirX, y: sm.lastDirY };

                    // ID-based bullet sync: update existing, add new, remove dead
                    if (sm.bullets) {
                        // Remove bullets that are gone from host
                        const hostBulletIds = new Set(sm.bullets.map(sb => sb.id));
                        m.bullets = m.bullets.filter(b => hostBulletIds.has(b.id));

                        // Add new bullets the host has that we don't
                        sm.bullets.forEach(sb => {
                            const existing = m.bullets.find(b => b.id === sb.id);
                            if (!existing) {
                                const b = new Bullet(sb.x, sb.y, sb.dx, sb.dy, sb.power || 1);
                                b.id = sb.id; // Keep same ID for tracking
                                b.color = sb.color;
                                m.bullets.push(b);
                            }
                            // If existing: let b.update() in minion.update() handle movement
                        });
                    }
                } else {
                    // Create New
                    const newMinion = new Minion(sm.x, sm.y, sm.maxHp, 1.2, sm.wave, sm.color, sm.isKing, sm.id);
                    newMinion.hp = sm.hp;
                    newMinion.onShoot = () => playBulletSound(false);
                    if (sm.isKing) newMinion.onUltimatum = () => playUltimatumSound(false);
                    if (sm.ultActive !== undefined) newMinion.ultActive = sm.ultActive;
                    if (sm.lastDirX !== undefined) newMinion.lastDir = { x: sm.lastDirX, y: sm.lastDirY };
                    if (sm.bullets) {
                        sm.bullets.forEach(sb => {
                            const b = new Bullet(sb.x, sb.y, sb.dx, sb.dy, sb.power || 1);
                            b.id = sb.id;
                            b.color = sb.color;
                            newMinion.bullets.push(b);
                        });
                    }
                    minions.push(newMinion);
                }
            });

            // 2. Remove dead / gone
            for (let i = minions.length - 1; i >= 0; i--) {
                const exists = receivedMinions.some(sm => sm.id === minions[i].id);
                if (!exists) {
                    minions.splice(i, 1);
                }
            }
        }

        // Sync Spells jika dikirim (HANYA DARI HOST)
        if (state.spells && player.isHost) {
            spells.length = 0;
            state.spells.forEach(s => {
                const spell = new Spell(s.x, s.y, s.type, s.id);
                spell.lifetime = s.lifetime;
                spells.push(spell);
            });
        }
    }

    // Sync Timer & Scores dari Host secara periodik
    if (state && player.isHost) {
        if (state.battleTimeRemaining !== undefined) battleTimeRemaining = state.battleTimeRemaining;
        if (state.waveTimer !== undefined) waveTimer = state.waveTimer;
        if (state.isGameOver && !isGameOver) endGame();

        // Host Authority: HP Sync
        if (state.playerHps) {
            const myId = getMyId();
            // Sync current player's HP from Host
            if (state.playerHps[myId] !== undefined) {
                // Hanya update jika Host lapor HP kita berkurang (Damage hits)
                if (state.playerHps[myId] < player1.hp) {
                    player1.hp = state.playerHps[myId];
                    if (player1.hp <= 0) player1.die({ name: "MINION" });
                }
            }
            // Sync remote players HP as well
            Object.keys(state.playerHps).forEach(pid => {
                if (pid !== myId && remotePlayers[pid]) {
                    remotePlayers[pid].hp = state.playerHps[pid];
                }
            });
        }
    }
    // Simpan input terakhir untuk diproses di game loop (Dead Reckoning)
    player.lastInput = input;
}

export function startGame() {
    requestAnimationFrame(gameLoop);
}
// --- HELPER FUNCTIONS FOR TOWER DEFENSE ---

function spawnWave() {
    waveNumber++;
    const redIntensity = Math.min(255, waveNumber * 12);
    const waveColor = `rgb(255, ${255 - redIntensity}, 0)`;

    // King only spawns on odd waves (1, 3, 5, ...)
    const kingSpawnsThisWave = (waveNumber % 2 === 1);

    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            if (isGameOver) return;
            const isKing = kingSpawnsThisWave && (i === 3);
            const baseHp = 100 + (waveNumber * 20);
            const minionHp = isKing ? baseHp * 2.5 : (baseHp * (0.3 + (i * 0.1)));
            const mId = `wave_${waveNumber}_m_${i}_${Date.now()}`;
            const m = new Minion(1180, 200 + Math.random() * 800, minionHp, 1.2, waveNumber, waveColor, isKing, mId);
            m.onShoot = () => playBulletSound(false);
            if (isKing) m.onUltimatum = () => playUltimatumSound(false);
            minions.push(m);
        }, i * 1000);
    }
}

function checkLaserHitEntity(shooter, target) {
    const laserLength = getLaserDistance(shooter, 600);
    let { x: dx, y: dy } = shooter.lastDir;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) { dx /= mag; dy /= mag; }

    const sx = shooter.x + shooter.size / 2;
    const sy = shooter.y + shooter.size / 2;
    const tx = target.x + target.size / 2;
    const ty = target.y + target.size / 2;

    const dot = ((tx - sx) * dx + (ty - sy) * dy);
    if (dot < 0 || dot > laserLength) return false;

    const projX = sx + dot * dx;
    const projY = sy + dot * dy;
    const dist = Math.sqrt((tx - projX) ** 2 + (ty - projY) ** 2);
    return dist < target.size + 15;
}
