import { Bullet } from "./bullet.js";
import { checkObstacleCollision, getSafePosition, checkTowerCollision } from "./map.js";

export class Player {
    constructor(x, y, color = "lime", name = "Player", role = "damager") {
        this.x = x;
        this.y = y;
        this.baseSpeed = 4;
        this.speed = this.baseSpeed;
        this.size = 20;
        this.name = name;

        this.color = color;

        this.hp = 100;
        this.maxHp = 100;

        this.bullets = [];
        this.cooldown = 0;
        
        this.speedCooldown = 0;
        this.speedTimer = 0;
        
        this.shieldCooldown = 0;
        this.shieldTimer = 0;
        
        this.energy = 100;
        this.maxEnergy = 100;
        this.isAlive = true;
        this.respawnTimer = 0;
        this.team = 0; 
        this.bulletPower = 1;

        this.ultCooldown = 0;
        this.ultActive = 0; // Durasi laser nyala

        this.walkTimer = 0;
        this.trail = [];

        this.lastDir = { x: 1, y: 0 };
        this.isHost = false;
        this.consumedSpellIds = [];
        this.currentTarget = null;
        this.isShooting = false;

        // Sound Callbacks
        this.onShoot = null;
        this.onUltimatum = null;
        this.onSpeed = null;
        this.onBulletHit = null;
        this.onShieldHit = null; // Callback untuk efek partikel saat hit dengan shield
        this.onDeath = null; // Callback saat player mati
        this.killer = null;
        this.role = role;
        
        this.score = 0; // Kills
        this.deaths = 0;
    }


    update(input, allPlayers = [], towers = [], minions = []) {
        if (!this.isAlive) {
            if (this.respawnTimer > 0) this.respawnTimer--;
            return;
        }

        // Update targeting for Visual Aim & Skills
        let nearestTarget = null;
        let nearestDist = 300; // Auto-aim range
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;

        minions.forEach(m => {
            const mx = m.x + m.size / 2;
            const my = m.y + m.size / 2;
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
            if (d < nearestDist) {
                nearestDist = d;
                nearestTarget = m;
            }
        });

        this.currentTarget = nearestTarget;
        this.isShooting = !!input.shoot;

        const dx = input.x;
        const dy = input.y;

        // Persistent Lock-on: If target in range, ALWAYS face it to avoid analog jitter
        if (nearestTarget) {
            const tdx = (nearestTarget.x + nearestTarget.size/2) - cx;
            const tdy = (nearestTarget.y + nearestTarget.size/2) - cy;
            const mag = Math.sqrt(tdx * tdx + tdy * tdy);
            if (mag > 0) {
                this.lastDir = { x: tdx / mag, y: tdy / mag };
            }
            if (dx !== 0 || dy !== 0) {
                this.walkTimer += 0.25 * (this.speed / this.baseSpeed);
            }
        } else if (dx !== 0 || dy !== 0) {
            this.lastDir = { x: dx, y: dy };
            this.walkTimer += 0.25 * (this.speed / this.baseSpeed);
        } else {
            this.walkTimer = 0;
        }

        // Logic Lari Kencang (Speed Dash) - Sekarang pakai Energy
        if (this.speedCooldown > 0) this.speedCooldown--;
        if (this.speedTimer > 0 && this.energy > 0) {
            this.speedTimer--;
            // Damager membakar energi lebih cepat saat dash
            const energyDrain = (this.role === "damager") ? 0.5 : 0.2;
            this.energy -= energyDrain;
            this.speed = this.baseSpeed * 2.5;
            if (this.speedTimer % 2 === 0) {
                this.trail.push({ x: this.x, y: this.y, alpha: 0.8 });
            }
        } else {
            this.speedTimer = 0;
            this.speed = this.baseSpeed;
        }

        // Minimum energy untuk bisa dash: Damager 20, Tanker/Healer 10
        const speedMinEnergy = (this.role === "damager") ? 20 : 10;
        if (input.speed && this.speedCooldown === 0 && this.energy > speedMinEnergy) {
            this.speedTimer = 60;
            this.speedCooldown = 300;
            if (this.onSpeed) this.onSpeed();
        }

        // Regen Energi Pasif (Dibuat lebih pelan)
        if (this.energy < this.maxEnergy) this.energy += 0.03;

        // Logic Tameng (Shield)
        if (this.shieldCooldown > 0) this.shieldCooldown--;
        if (this.shieldTimer > 0) this.shieldTimer--;

        if (input.shield && this.shieldCooldown === 0) {
            this.shieldTimer = 90; // Kebal 1.5 detik
            this.shieldCooldown = 180; // 3 detik cooldown
        }

        // Pudarkan Trail (Efek Angin)
        this.trail.forEach(t => t.alpha -= 0.05);
        this.trail = this.trail.filter(t => t.alpha > 0);

        const prevX = this.x;
        this.x += dx * this.speed;
        if (checkObstacleCollision(this) || checkTowerCollision(this, towers)) this.x = prevX;

        const prevY = this.y;
        this.y += dy * this.speed;
        if (checkObstacleCollision(this) || checkTowerCollision(this, towers)) this.y = prevY;

        // Pisahkan jika tumpang tindih dengan pemain lain (Fix Stuck Bug)
        this.resolvePlayerOverlaps(allPlayers);

        // Cegah player keluar canvas (asumsi canvas 1800x900)
        if (this.x < 0) this.x = 0;
        if (this.x > 1800 - this.size) this.x = 1800 - this.size;
        if (this.y < 0) this.y = 0;
        if (this.y > 900 - this.size) this.y = 900 - this.size;

        if (this.cooldown > 0) this.cooldown--;
        if (this.ultCooldown > 0) this.ultCooldown--;
        if (this.ultActive > 0) this.ultActive--;

        if (input.shoot && this.cooldown === 0 && this.energy >= 2) {
            this.shoot(minions);
            // Damager tembakan lebih mahal; Tanker/Healer lebih efisien
            const shootCost = (this.role === "damager") ? 2 : 1;
            this.energy -= shootCost;
            this.cooldown = 15;
        }

        // Minimum energy untuk ult: Damager 40, Tanker/Healer 20
        const ultMinEnergy = (this.role === "damager") ? 40 : 20;
        if (input.ult && this.ultCooldown === 0 && this.energy >= ultMinEnergy) {
            this.useUltimatum();
        }

        this.bullets.forEach((b) => b.update());
    }

    checkPlayerCollision(allPlayers) {
        if (!allPlayers) return false;
        const margin = 2; // Hindari stuck rigid
        for (let p of allPlayers) {
            if (p === this || !p.isAlive) continue; // Langsung skip jika mati (Fix Ghost Collision)
            if (
                this.x + margin < p.x + p.size &&
                this.x + this.size - margin > p.x &&
                this.y + margin < p.y + p.size &&
                this.y + this.size - margin > p.y
            ) {
                return true;
            }
        }
        return false;
    }

    resolvePlayerOverlaps(allPlayers) {
        if (!allPlayers) return;
        for (let p of allPlayers) {
            if (p === this || !p.isAlive) continue;
            
            // Hitung jarak pusat antar pemain
            const cx1 = this.x + this.size / 2;
            const cy1 = this.y + this.size / 2;
            const cx2 = p.x + p.size / 2;
            const cy2 = p.y + p.size / 2;
            
            const dx = cx1 - cx2;
            const dy = cy1 - cy2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = (this.size + p.size) * 0.45; // Radius gabungan

            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                // Dorong keluar dengan porsi kecil tiap frame
                this.x += (dx / dist) * overlap * 0.2;
                this.y += (dy / dist) * overlap * 0.2;
            } else if (dist === 0) {
                // Jika benar-benar di titik yang sama, geser random sedikit
                this.x += Math.random() - 0.5;
                this.y += Math.random() - 0.5;
            }
        }
    }

    shoot(minions = []) {
        if (this.ultActive > 0) return; // Gak bisa nembak pas ulti
        
        // --- AUTO AIM LOGIC ---
        // Since we already update lastDir in update() based on minions, 
        // we can simplify shoot() to use lastDir (which is now Auto Aimed).
        let ndx = this.lastDir.x;
        let ndy = this.lastDir.y;
        
        const mag = Math.sqrt(ndx * ndx + ndy * ndy);
        if (mag > 0) {
            ndx /= mag;
            ndy /= mag;
        } else {
            ndx = 1; ndy = 0;
        }

        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;

        // Offset moncong senjata (Dibuat lebih pendek agar bisa hit jarak dekat)
        const muzzleOffset = 12;
        const spawnX = cx + ndx * muzzleOffset;
        const spawnY = cy + ndy * muzzleOffset;

        // Spawn peluru (disesuaikan agar center arc di bullet.js pas dengan moncong)
        // Kita kurangi 2.5 (setengah dari size default peluru 5)
        const b = new Bullet(spawnX - 2.5, spawnY - 2.5, ndx, ndy, this.bulletPower);
        b.onHit = this.onBulletHit; // Pasang callback percikan
        this.bullets.push(b);

        if (this.onShoot) this.onShoot();
    }



    useUltimatum() {
        // Biaya energi: Damager 40, Tanker/Healer 20 (lebih efisien)
        const ultCost = (this.role === "damager") ? 40 : 20;
        if (this.energy < ultCost || this.ultCooldown > 0) return;
        this.energy -= ultCost;
        
        // Durasi: Damager 1s (60), Tanker/Healer 3s (180)
        this.ultActive = (this.role === "tanker" || this.role === "healer") ? 180 : 60;
        
        this.ultCooldown = 600; // 10 detik cooldown

        if (this.onUltimatum) this.onUltimatum();
    }

    resetState() {
        this.hp = this.maxHp;
        this.energy = this.maxEnergy;
        this.score = 0;
        this.deaths = 0;
        this.isAlive = true;

        this.respawnTimer = 0;
        this.bullets = [];
        this.trail = [];
        this.ultActive = 0;
        this.ultCooldown = 0;
        this.speedTimer = 0;
        this.speedCooldown = 0;
        this.shieldTimer = 0;
        this.shieldCooldown = 0;
        this.bulletPower = 1.0;
        this.consumedSpellIds = [];
    }

    draw(ctx) {
        if (!this.isAlive) return;

        // Nama di atas karakter (Sesuai Role)
        let nameColor = "white";
        if (this.role === "damager") nameColor = "#ff4757"; // Merah
        else if (this.role === "tanker") nameColor = "#ffa502"; // Orange
        else if (this.role === "healer") nameColor = "#2ed573"; // Hijau
        
        ctx.fillStyle = nameColor;
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.name, this.x + this.size/2, this.y - 25);

        // --- DRAW ATTACK RANGE (POV Local Player Only) ---
        if (this.isShooting) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x + this.size/2, this.y + this.size/2, 300, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 150, 255, 0.05)";
            ctx.fill();
            ctx.strokeStyle = "rgba(0, 150, 255, 0.3)";
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.stroke();
            ctx.restore();
        }

        // 0. Bayangan Bawah (Shadow)
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(this.x + this.size/2, this.y + this.size, this.size/1.5, this.size/4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 1. Gambar Ghost Trail Efek Angin (Di Bawah Pemain)
        this.trail.forEach(t => {
            ctx.fillStyle = `rgba(255, 255, 255, ${t.alpha})`;
            ctx.fillRect(t.x, t.y, this.size, this.size);
        });

        // 2. Kalkulasi Rotasi dan Body Bobbing
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const faceAngle = Math.atan2(this.lastDir.y, this.lastDir.x);
        
        // Efek goyang saat jalan
        const bobbing = Math.sin(this.walkTimer * 0.8) * 1.5;

        ctx.save();
        ctx.translate(cx, cy + bobbing);
        ctx.rotate(faceAngle);

        // --- DRAW WEAPON (Plasma Gun) ---
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(this.size/3, -3, 15, 6); // Barrel
        ctx.fillStyle = "#34495e";
        ctx.fillRect(this.size/3 - 5, -5, 10, 10); // Body Gun
        // Tip Glow
        ctx.fillStyle = "cyan";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "cyan";
        ctx.fillRect(this.size/3 + 12, -2, 3, 4);
        ctx.shadowBlur = 0;

        // --- KAKI (Animated) ---
        const swing = Math.sin(this.walkTimer) * 5;
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.roundRect(-this.size/2 + swing, -this.size/2 - 2, 7, 4, 2); // Kaki Kiri
        ctx.roundRect(-this.size/2 - swing, this.size/2 - 2, 7, 4, 2);  // Kaki Kanan
        ctx.fill();

        // --- BADAN (3D Look) ---
        const bodyGrad = ctx.createLinearGradient(-this.size/2, -this.size/2, this.size/2, this.size/2);
        bodyGrad.addColorStop(0, this.color);
        bodyGrad.addColorStop(1, "#000"); // Efek dimensi / gelap
        
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(-this.size/2, -this.size/2, this.size, this.size, 6);
        ctx.fill();

        // --- HELMET / VISOR ---
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.arc(0, 0, this.size/3, 0, Math.PI * 2);
        ctx.fill();
        
        // Visor Glow
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.size/10, -this.size/5);
        ctx.lineTo(this.size/4, 0);
        ctx.lineTo(this.size/10, this.size/5);
        ctx.stroke();

        ctx.restore();

        // 3. Efek Gelembung Perisai (Shield Barrier) - tidak ikut berotasi
        if (this.shieldTimer > 0) {
            const scx = this.x + this.size / 2;
            const scy = this.y + this.size / 2;
            const shieldRadius = this.size * 1.4;
            const pulse = Math.sin(Date.now() / 120) * 2;
            const time = Date.now() / 500;

            ctx.save();

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(scx, scy, shieldRadius + pulse, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 20;
            ctx.shadowColor = "cyan";
            ctx.stroke();

            // Inner fill
            ctx.beginPath();
            ctx.arc(scx, scy, shieldRadius + pulse, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 255, 255, 0.08)";
            ctx.fill();

            // Rotating arc segments (dramatic effect)
            for (let i = 0; i < 3; i++) {
                const angle = time + (i * Math.PI * 2 / 3);
                ctx.beginPath();
                ctx.arc(scx, scy, shieldRadius + pulse, angle, angle + 0.8);
                ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
                ctx.lineWidth = 4;
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00ffff";
                ctx.stroke();
            }

            ctx.restore();
        }

        // Gambar HP Bar
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(this.x, this.y - 18, this.size, 8);
        
        ctx.fillStyle = "#2ecc71"; // HP Green
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillRect(this.x, this.y - 18, this.size * hpPercent, 4);
        
        ctx.fillStyle = "#f1c40f"; // Energy Yellow
        const enPercent = Math.max(0, this.energy / this.maxEnergy);
        ctx.fillRect(this.x, this.y - 14, this.size * enPercent, 4);

        // Bersihkan dan gambar peluru
        this.bullets = this.bullets.filter(b => b.active);
        this.bullets.forEach((b) => b.draw(ctx));
    }

    die(killer = null) {
        if (!this.isAlive) return; // Mencegah double call
        this.killer = killer;
        this.isAlive = false;
        this.deaths++;
        this.respawnTimer = 300; // 5 detik (60 FPS)

        this.bullets = [];
        this.trail = [];
        this.ultActive = 0;
        if (this.onDeath) this.onDeath();
    }

    respawn(x, y, towers = []) {
        let safe = getSafePosition(x, y, this.size);
        
        // Cek tambahan: Jika safe spawn masih nabrak tower, cari tempat lain
        if (checkTowerCollision({ ...safe, size: this.size }, towers)) {
            // Geser sedikit ke bawah/atas jika terjebak di tower BASE (100,560)
            safe.y += 100; 
        }

        this.x = safe.x;
        this.y = safe.y;
        this.hp = this.maxHp;
        this.energy = this.maxEnergy;
        this.isAlive = true;
        this.bulletPower = 1;
        this.consumedSpellIds = [];
        this.killer = null;
    }
}