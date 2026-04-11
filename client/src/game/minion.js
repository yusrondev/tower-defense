import { Bullet } from "./bullet.js";
import { checkObstacleCollision } from "./map.js";

export class Minion {
    constructor(x, y, maxHp, speed, wave, color, isKing = false, id = null) {
        this.id = id || (Date.now() + Math.random());
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.hp = maxHp;
        this.maxHp = maxHp;
        this.speed = speed;
        this.size = isKing ? 35 : 20; // King is much larger
        this.wave = wave;
        this.color = color;
        this.isKing = isKing;
        this.bullets = [];
        this.cooldown = 0;
        this.isAlive = true;
        this.target = null;
        this.walkTimer = 0;
        this.radiusOpacity = 0;
        this.onShoot = null; 

        this.ultActive = 0;
        this.ultCooldown = 0;
        this.lastDir = { x: 1, y: 0 };
        this.onUltimatum = null; // Callback untuk suara laser boss

        // --- Wave Scaling (Size, Damage, Speed, Fire Rate) ---
        const scaleFactor = (wave - 1) * 0.5;
        this.size = (isKing ? 35 : 20) + scaleFactor;
        
        // King boss laser damage is FIXED (does not scale with wave)
        // Only small minions scale damage per wave
        this.bulletPower = isKing ? 1.2 : 0.8 + (wave * 0.04);
        
        // Speed scaling: +0.05 speed per wave
        this.speed = speed + (wave * 0.05);
        
        // Fire rate scaling (Small minions only): 150→45 frames over 10 waves
        this.maxCooldown = Math.max(45, 150 - (wave * 12));

        // Waypoints
        this.waypoints = null;
        this.currentWaypointIndex = 0;
    }

    setWaypoints(wps) {
        if (wps && wps.length > 0) {
            this.waypoints = wps;
            this.currentWaypointIndex = 0;
        }
    }

    update(allTowers, allPlayers, isHost = true) {
        if (!this.isAlive) return;

        // Bullets update for everyone
        this.bullets.forEach(b => b.update());
        this.bullets = this.bullets.filter(b => b.active);

        // Proximity calculation for UI (Radius circle) - Runs for everyone
        let nearestThreatDist = 9999;
        const detectionRange = this.isKing ? 450 : 300; // Match firing range

        // Check players for UI radius
        allPlayers.forEach(p => {
            if (!p.isAlive) return;
            const pdx = (p.x + p.size/2) - (this.x + this.size/2);
            const pdy = (p.y + p.size/2) - (this.y + this.size/2);
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pdist < nearestThreatDist) nearestThreatDist = pdist;
        });
        
        // Check towers for UI radius
        if (allTowers) {
            allTowers.forEach(t => {
                if (!t.isAlive) return;
                const tdx = (t.x + t.size/2) - (this.x + this.size/2);
                const tdy = (t.y + t.size/2) - (this.y + this.size/2);
                const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
                if (tdist < nearestThreatDist) nearestThreatDist = tdist;
            });
        }

        // Update Radius UI Opacity
        if (nearestThreatDist < (detectionRange + 50)) {
            this.radiusOpacity = Math.min(0.15, this.radiusOpacity + 0.02);
        } else {
            this.radiusOpacity = Math.max(0, this.radiusOpacity - 0.01);
        }
 
        if (this.ultActive > 0) this.ultActive--;
        if (this.ultCooldown > 0) this.ultCooldown--;
 
        if (!isHost) {
            // Joiner Side: Smoothing (Interpolation)
            this.x += (this.targetX - this.x) * 0.2;
            this.y += (this.targetY - this.y) * 0.2;
            this.walkTimer += 0.2; // Keep walk animation playing
            return;
        }

        // Host Side: Full AI Logic
        let shootTarget = null;
        let bestTargetDist = 9999;

        // 1. Check for Players & Towers
        allPlayers.forEach(p => {
            if (!p.isAlive) return;
            const pdx = (p.x + p.size/2) - (this.x + this.size/2);
            const pdy = (p.y + p.size/2) - (this.y + this.size/2);
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            
            if (pdist < detectionRange && pdist < bestTargetDist) {
                bestTargetDist = pdist;
                shootTarget = { x: p.x + p.size/2, y: p.y + p.size/2, dist: pdist };
            }
        });

        if (allTowers) {
            allTowers.forEach(t => {
                if (!t.isAlive) return;
                const tdx = (t.x + t.size/2) - (this.x + this.size/2);
                const tdy = (t.y + t.size/2) - (this.y + this.size/2);
                const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

                if (tdist < detectionRange && tdist < bestTargetDist) {
                    bestTargetDist = tdist;
                    shootTarget = { x: t.x + t.size/2, y: t.y + t.size/2, dist: tdist };
                }
            });
        }

        // Determine default fallback target (prefer BASE tower)
        if (allTowers) {
            const base = allTowers.find(t => t.label === "BASE" && t.isAlive);
            this.target = base || allTowers.find(t => t.isAlive);
        } else {
            this.target = null;
        }

        // --- Waypoint Navigation Logic ---
        let waypointTarget = null;
        if (this.waypoints && this.currentWaypointIndex < this.waypoints.length) {
            waypointTarget = this.waypoints[this.currentWaypointIndex];
            
            // If close to waypoint, move to next
            const dx = waypointTarget.x - (this.x + this.size/2);
            const dy = waypointTarget.y - (this.y + this.size/2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Increased threshold from 15 to 30 for better reliability
            if (dist < 30) {
                this.currentWaypointIndex++;
                if (this.currentWaypointIndex < this.waypoints.length) {
                    waypointTarget = this.waypoints[this.currentWaypointIndex];
                } else {
                    waypointTarget = null;
                }
            }
        }

        // 2. Logic Movement & Shooting
        if (shootTarget) {
            // PRIORITY 1: AGGRESSIVE COMBAT (Overrides Path)
            const dx = shootTarget.x - (this.x + this.size / 2);
            const dy = shootTarget.y - (this.y + this.size / 2);
            const dist = shootTarget.dist;

            // Aggressive Movement
            const engagementDist = 80; 
            if (dist > engagementDist) {
                const moveSpeed = (this.isKing ? this.speed * 0.8 : this.speed);
                const vx = (dx / dist) * moveSpeed;
                const vy = (dy / dist) * moveSpeed;

                const nextX = this.x + vx;
                if (!checkObstacleCollision({ x: nextX, y: this.y, size: this.size })) {
                    this.x = nextX;
                }
                const nextY = this.y + vy;
                if (!checkObstacleCollision({ x: this.x, y: nextY, size: this.size })) {
                    this.y = nextY;
                }
                this.walkTimer += 0.2;
            }

            // Attack Logic
            const firingRange = this.isKing ? 450 : 300;
            if (this.cooldown > 0) this.cooldown--;
            this.lastDir = { x: dx / dist, y: dy / dist };

            if (this.isKing) {
                if (this.ultCooldown === 0 && dist < firingRange) {
                    this.ultActive = 60;
                    this.ultCooldown = 780;
                    if (this.onUltimatum) this.onUltimatum();
                }
            } else if (this.cooldown === 0 && dist < firingRange) {
                this.shoot(dx / dist, dy / dist);
                this.cooldown = this.maxCooldown;
            }

        } else if (waypointTarget) {
            // PRIORITY 2: PATH NAVIGATION
            const dx = waypointTarget.x - (this.x + this.size / 2);
            const dy = waypointTarget.y - (this.y + this.size / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                const moveSpeed = (this.isKing ? this.speed * 0.8 : this.speed);
                const vx = (dx / dist) * moveSpeed;
                const vy = (dy / dist) * moveSpeed;

                const nextX = this.x + vx;
                if (!checkObstacleCollision({ x: nextX, y: this.y, size: this.size })) {
                    this.x = nextX;
                }
                const nextY = this.y + vy;
                if (!checkObstacleCollision({ x: this.x, y: nextY, size: this.size })) {
                    this.y = nextY;
                }
                this.walkTimer += 0.2;
            }
            this.lastDir = { x: dx / dist, y: dy / dist };

        } else if (this.target) {
            // PRIORITY 3: FINAL TARGET (TOWER)
            const dx = (this.target.x + this.target.size / 2) - (this.x + this.size / 2);
            const dy = (this.target.y + this.target.size / 2) - (this.y + this.size / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > (this.isKing ? 200 : 150)) {
                const moveSpeed = (this.isKing ? this.speed * 0.8 : this.speed);
                const vx = (dx / dist) * moveSpeed;
                const vy = (dy / dist) * moveSpeed;

                const nextX = this.x + vx;
                if (!checkObstacleCollision({ x: nextX, y: this.y, size: this.size })) {
                    this.x = nextX;
                }
                const nextY = this.y + vy;
                if (!checkObstacleCollision({ x: this.x, y: nextY, size: this.size })) {
                    this.y = nextY;
                }
                this.walkTimer += 0.2;
            }

            this.lastDir = { x: dx / dist, y: dy / dist };
            if (this.cooldown > 0) this.cooldown--;

            if (this.isKing) {
                if (this.ultCooldown === 0 && dist < 450) {
                    this.ultActive = 60;
                    this.ultCooldown = 780;
                    if (this.onUltimatum) this.onUltimatum();
                }
            } else if (this.cooldown === 0 && dist < 450) {
                this.shoot(dx / dist, dy / dist);
                this.cooldown = this.maxCooldown;
            }
        }
        // Note: bullet update runs at the top of this method for everyone, not here.
    }

    shoot(ndx, ndy) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const muzzleOffset = this.size * 0.8;
        const spawnX = cx + ndx * muzzleOffset;
        const spawnY = cy + ndy * muzzleOffset;

        const b = new Bullet(spawnX - 2.5, spawnY - 2.5, ndx, ndy, this.bulletPower);
        b.color = this.isKing ? "#f1c40f" : this.color; // King bullets are golden
        this.bullets.push(b);

        if (this.onShoot) this.onShoot();
    }

    draw(ctx) {
        if (!this.isAlive) return;

        // Radius Attack UI
        if (this.radiusOpacity > 0) {
            const rcx = this.x + this.size/2;
            const rcy = this.y + this.size/2;
            const rRadius = this.isKing ? 200 : 250;
            const opacity = this.radiusOpacity;

            ctx.save();

            // Soft fill
            ctx.beginPath();
            ctx.arc(rcx, rcy, rRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 50, 50, ${opacity * 0.12})`;
            ctx.fill();

            // Inner ring (solid but soft)
            ctx.beginPath();
            ctx.arc(rcx, rcy, rRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 80, 80, ${opacity * 0.8})`;
            ctx.lineWidth = this.isKing ? 2 : 1.5;
            ctx.setLineDash(this.isKing ? [6, 3] : [4, 4]);
            ctx.shadowBlur = this.isKing ? 10 : 5;
            ctx.shadowColor = `rgba(255, 50, 50, ${opacity})`;
            ctx.stroke();

            ctx.restore();
        }

        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(cx, cy + this.size/2, this.size/1.5, this.size/4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Minion body
        ctx.save();
        ctx.translate(cx, cy + Math.sin(this.walkTimer) * 2);
        
        // Body
        ctx.fillStyle = this.isKing ? "#2c3e50" : this.color;
        ctx.shadowBlur = this.isKing ? 20 : 10;
        ctx.shadowColor = this.isKing ? "#f1c40f" : this.color;
        ctx.beginPath();
        ctx.roundRect(-this.size/2, -this.size/2, this.size, this.size, this.isKing ? 8 : 4);
        ctx.fill();
        
        // King Crown
        if (this.isKing) {
            ctx.fillStyle = "#f1c40f";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "gold";
            ctx.beginPath();
            ctx.moveTo(-this.size/2, -this.size/2);
            ctx.lineTo(-this.size/2, -this.size/2 - 15);
            ctx.lineTo(-this.size/4, -this.size/2 - 5);
            ctx.lineTo(0, -this.size/2 - 15);
            ctx.lineTo(this.size/4, -this.size/2 - 5);
            ctx.lineTo(this.size/2, -this.size/2 - 15);
            ctx.lineTo(this.size/2, -this.size/2);
            ctx.closePath();
            ctx.fill();
        }

        // Eye (Glow)
        ctx.fillStyle = this.isKing ? "#f1c40f" : "white";
        ctx.beginPath();
        ctx.arc(this.size/4, -this.size/6, this.isKing ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        ctx.shadowBlur = 0;


        // HP Bar
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(this.x, this.y - 12, this.size, 4);
        
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = "#e74c3c"; // Minion HP is Red
        ctx.fillRect(this.x, this.y - 12, this.size * hpPercent, 4);
        
        // Render bullets
        this.bullets.forEach(b => b.draw(ctx));
    }
}
