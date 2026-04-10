import { Bullet } from "./bullet.js";

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
    }

    update(targetTower, allPlayers, isHost = true) {
        if (!this.isAlive) return;

        // Bullets update for everyone
        this.bullets.forEach(b => b.update());
        this.bullets = this.bullets.filter(b => b.active);

        // Proximity calculation for UI (Radius circle) - Runs for everyone
        let nearestPlayerDist = 9999;
        allPlayers.forEach(p => {
            if (!p.isAlive) return;
            const pdx = (p.x + p.size/2) - (this.x + this.size/2);
            const pdy = (p.y + p.size/2) - (this.y + this.size/2);
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pdist < nearestPlayerDist) nearestPlayerDist = pdist;
        });

        // Update Radius UI Opacity
        // Update Radius UI Opacity
        const detectionRange = this.isKing ? 200 : 250;
        if (nearestPlayerDist < (detectionRange + 50)) {
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
        // Reset target to tower by default
        this.target = targetTower;
        let shootTarget = null;
        let bestPlayerDist = 9999;

        // 1. Check for Players first (Priority)
        allPlayers.forEach(p => {
            if (!p.isAlive) return;
            const pdx = (p.x + p.size/2) - (this.x + this.size/2);
            const pdy = (p.y + p.size/2) - (this.y + this.size/2);
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            
            // Target nearest player within range
            if (pdist < detectionRange && pdist < bestPlayerDist) {
                bestPlayerDist = pdist;
                shootTarget = { x: p.x + p.size/2, y: p.y + p.size/2, dist: pdist };
            }
        });

        // 2. Logic Movement & Shooting
        if (shootTarget) {
            // Priority target: Player
            const dx = shootTarget.x - (this.x + this.size / 2);
            const dy = shootTarget.y - (this.y + this.size / 2);
            const dist = shootTarget.dist;

            // --- Aggressive Movement: Move towards player if too far ---
            const engagementDist = 80; 
            if (dist > engagementDist) {
                this.x += (dx / dist) * (this.isKing ? this.speed * 0.8 : this.speed);
                this.y += (dy / dist) * (this.isKing ? this.speed * 0.8 : this.speed);
                this.walkTimer += 0.2;
            }

            const firingRange = this.isKing ? 450 : 300;
            if (this.cooldown > 0) this.cooldown--;
 
            // Update lastDir for Laser visual
            this.lastDir = { x: dx / dist, y: dy / dist };
 
            if (this.isKing) {
                // KING BOSS: Plasma Laser every 13 seconds
                if (this.ultCooldown === 0 && dist < firingRange) {
                    this.ultActive = 60; // 1 second
                    this.ultCooldown = 780; // 13 seconds
                    if (this.onUltimatum) this.onUltimatum();
                }
            } else if (this.cooldown === 0 && dist < firingRange) {
                this.shoot(dx / dist, dy / dist);
                this.cooldown = this.maxCooldown;
            }
        } else if (this.target) {
            // Secondary target: Tower (Only if no player detected)
            const dx = (this.target.x + this.target.size / 2) - (this.x + this.size / 2);
            const dy = (this.target.y + this.target.size / 2) - (this.y + this.size / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > (this.isKing ? 200 : 150)) {
                this.x += (dx / dist) * (this.isKing ? this.speed * 0.8 : this.speed);
                this.y += (dy / dist) * (this.isKing ? this.speed * 0.8 : this.speed);
                this.walkTimer += 0.2;
            }

            // Update lastDir for Laser visual
            this.lastDir = { x: dx / dist, y: dy / dist };
 
            if (this.cooldown > 0) this.cooldown--; // <-- BUG FIX: was missing

            if (this.isKing) {
                if (this.ultCooldown === 0 && dist < 450) {
                    this.ultActive = 60;
                    this.ultCooldown = 780; // 13 seconds
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
