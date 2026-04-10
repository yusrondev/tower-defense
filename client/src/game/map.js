export const obstacles = [
    // --- BORDERS (Outer Walls) ---
    { x: 0, y: -20, w: 1800, h: 20, color: "#444" },    // Top
    { x: 0, y: 900, w: 1800, h: 20, color: "#444" },  // Bottom
    { x: -20, y: 0, w: 20, h: 900, color: "#444" },   // Left
    { x: 1800, y: 0, w: 20, h: 900, color: "#444" }   // Right
];

export function checkObstacleCollision(rect) {
    for (let obs of obstacles) {
        if (
            rect.x < obs.x + obs.w &&
            rect.x + rect.size > obs.x &&
            rect.y < obs.y + obs.h &&
            rect.y + rect.size > obs.y
        ) {
            return true;
        }
    }
    return false;
}

export function checkEntityCollision(rect, entities) {
    for (let ent of entities) {
        if (!ent.isAlive && ent.hp <= 0) continue;
        const size = ent.size || 20;
        if (
            rect.x < ent.x + size &&
            rect.x + rect.size > ent.x &&
            rect.y < ent.y + size &&
            rect.y + rect.size > ent.y
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Cek tabrakan dengan tower yang masih hidup
 */
export function checkTowerCollision(rect, towers = []) {
    for (let t of towers) {
        if (!t.isAlive) continue; // Jangan tabrak yang hancur
        if (
            rect.x < t.x + t.size &&
            rect.x + rect.size > t.x &&
            rect.y < t.y + t.size &&
            rect.y + rect.size > t.y
        ) {
            return true;
        }
    }
    return false;
}

// Menemukan posisi aman terdekat
export function getSafePosition(x, y, size) {
    if (!checkObstacleCollision({ x, y, size })) return { x, y };
    return x < 600 ? { x: 100, y: 1100 } : { x: 1100, y: 100 };
}

// Menemukan posisi acak yang tidak nabrak tembok
export function getRandomSafePosition(size) {
    let tries = 0;
    while(tries < 50) {
        const x = Math.random() * 1600 + 100;
        const y = Math.random() * 700 + 100;
        if (!checkObstacleCollision({ x, y, size })) {
            return { x, y };
        }
        tries++;
    }
    return { x: 900, y: 450 }; // Fallback ke tengah lane
}

export function drawObstacles(ctx) {
    obstacles.forEach(obs => {
        // Neon Glow / Shadow
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(0, 255, 255, 0.4)";
        
        // Body (Dark Crystal)
        const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
        grad.addColorStop(0, "#0a0a0a");
        grad.addColorStop(1, "#1a1a2a");
        
        ctx.fillStyle = grad;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        
        // Neon Border
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Reset shadow agar tidak berat ke render lain
        ctx.shadowBlur = 0;
    });
}
