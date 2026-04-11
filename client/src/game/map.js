export let obstacles = [
    // --- BORDERS (Outer Walls) ---
    { x: 0, y: -20, w: 1800, h: 20, color: "#444" },    // Top
    { x: 0, y: 900, w: 1800, h: 20, color: "#444" },  // Bottom
    { x: -20, y: 0, w: 20, h: 900, color: "#444" },   // Left
    { x: 1800, y: 0, w: 20, h: 900, color: "#444" }   // Right
];

export let arenaWidth = 1800;
export let arenaHeight = 900;

export function setMapData(data) {
    if (data && data.obstacles) {
        obstacles = data.obstacles;
        arenaWidth = data.width || 1800;
        arenaHeight = data.height || 900;
    } else {
        // Fallback default
        arenaWidth = 1800;
        arenaHeight = 900;
        obstacles = [
            { x: 0, y: -20, w: 1800, h: 20, color: "#444" },
            { x: 0, y: 900, w: 1800, h: 20, color: "#444" },
            { x: -20, y: 0, w: 20, h: 900, color: "#444" },
            { x: 1800, y: 0, w: 20, h: 900, color: "#444" }
        ];
    }
}

export function getObstacleVertices(obs) {
    const cx = obs.x + obs.w / 2;
    const cy = obs.y + obs.h / 2;
    const angle = (obs.angle || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = obs.w / 2;
    const hh = obs.h / 2;

    return [
        { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
        { x: cx + (hw * cos - -hh * sin), y: cy + (hw * sin + -hh * cos) },
        { x: cx + (hw * cos - hh * sin), y: cy + (hw * sin + hh * cos) },
        { x: cx + (-hw * cos - hh * sin), y: cy + (-hw * sin + hh * cos) }
    ];
}

function getAxes(vertices) {
    const axes = [];
    for (let i = 0; i < vertices.length; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % vertices.length];
        const edge = { x: p1.x - p2.x, y: p1.y - p2.y };
        const normal = { x: -edge.y, y: edge.x };
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
        axes.push({ x: normal.x / length, y: normal.y / length });
    }
    return axes;
}

function project(vertices, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of vertices) {
        const p = v.x * axis.x + v.y * axis.y;
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return { min, max };
}

function overlap(p1, p2) {
    return p1.min <= p2.max && p2.min <= p1.max;
}

export function checkObstacleCollision(rect) {
    // Rect is local player/minion AABB: {x, y, size}
    const rectVertices = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.size, y: rect.y },
        { x: rect.x + rect.size, y: rect.y + rect.size },
        { x: rect.x, y: rect.y + rect.size }
    ];
    const rectAxes = getAxes(rectVertices);

    for (let obs of obstacles) {
        // Optimization: Fast AABB check if not rotated
        if (!obs.angle) {
            if (
                rect.x < obs.x + obs.w &&
                rect.x + rect.size > obs.x &&
                rect.y < obs.y + obs.h &&
                rect.y + rect.size > obs.y
            ) {
                return true;
            }
            continue;
        }

        const obsVertices = getObstacleVertices(obs);
        const obsAxes = getAxes(obsVertices);
        const axes = [...rectAxes, ...obsAxes];

        let collision = true;
        for (const axis of axes) {
            const p1 = project(rectVertices, axis);
            const p2 = project(obsVertices, axis);
            if (!overlap(p1, p2)) {
                collision = false;
                break;
            }
        }
        if (collision) return true;
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
    return x < (arenaWidth / 2) ? { x: 100, y: arenaHeight - 100 } : { x: arenaWidth - 100, y: 100 };
}

// Menemukan posisi acak yang tidak nabrak tembok
export function getRandomSafePosition(size) {
    let tries = 0;
    while(tries < 50) {
        const x = Math.random() * (arenaWidth - 200) + 100;
        const y = Math.random() * (arenaHeight - 200) + 100;
        if (!checkObstacleCollision({ x, y, size })) {
            return { x, y };
        }
        tries++;
    }
    return { x: arenaWidth / 2, y: arenaHeight / 2 }; // Fallback ke tengah lane
}

export function drawObstacles(ctx) {
    obstacles.forEach(obs => {
        ctx.save();
        
        const angle = (obs.angle || 0) * Math.PI / 180;
        const cx = obs.x + obs.w / 2;
        const cy = obs.y + obs.h / 2;

        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // Neon Glow / Shadow
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(0, 255, 255, 0.4)";
        
        // Body (Dark Crystal)
        const grad = ctx.createLinearGradient(-obs.w/2, -obs.h/2, obs.w/2, obs.h/2);
        grad.addColorStop(0, "#0a0a0a");
        grad.addColorStop(1, "#1a1a2a");
        
        ctx.fillStyle = grad;
        ctx.fillRect(-obs.w/2, -obs.h/2, obs.w, obs.h);
        
        // Neon Border
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(-obs.w/2, -obs.h/2, obs.w, obs.h);

        ctx.restore();
    });
}
