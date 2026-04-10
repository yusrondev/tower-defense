export class Tower {
    constructor(x, y, maxHp, size, label) {
        this.x = x;
        this.y = y;
        this.hp = maxHp;
        this.maxHp = maxHp;
        this.size = size;
        this.label = label;
        this.isAlive = true;
        this.destroyed = false;
        this.opacity = 1.0;
        this.fallOffset = 0;
    }

    update() {
        if (this.hp <= 0 && !this.destroyed) {
            this.destroyed = true;
        }

        if (this.destroyed) {
            this.isAlive = false;
            if (this.opacity > 0) {
                this.opacity -= 0.01;
                this.fallOffset += 0.5;
            }
        }
    }

    draw(ctx) {
        if (this.opacity <= 0) return;

        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2 + this.fallOffset;
        const towerY = this.y + this.fallOffset;

        ctx.save();
        ctx.globalAlpha = this.opacity;

        // Shadow (Stay on ground)
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(this.x + this.size / 2, this.y + this.size + 5, this.size / 1.5, this.size / 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tower Body (Crystal/Pillar look)
        const grad = ctx.createLinearGradient(this.x, towerY, this.x + this.size, towerY + this.size);
        grad.addColorStop(0, "#2c3e50");
        grad.addColorStop(0.5, "#34495e");
        grad.addColorStop(1, "#1a1a1a");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(this.x + this.size * 0.2, towerY + this.size);
        ctx.lineTo(this.x + this.size * 0.8, towerY + this.size);
        ctx.lineTo(this.x + this.size, towerY + this.size * 0.2);
        ctx.lineTo(cx, towerY);
        ctx.lineTo(this.x, towerY + this.size * 0.2);
        ctx.closePath();
        ctx.fill();

        // Neon Glow (Cyan)
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Top Crystal
        ctx.fillStyle = "cyan";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "cyan";
        ctx.beginPath();
        ctx.arc(cx, towerY + this.size * 0.2, this.size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label & HP Bar (Only if not destroyed)
        if (!this.destroyed) {
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText(this.label, cx, towerY - 30);

            // HP Bar
            const barW = this.size * 1.2;
            const barH = 6;
            const bx = cx - barW / 2;
            const by = towerY - 15;

            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(bx, by, barW, barH);
            
            const hpPercent = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = "#2ecc71";
            ctx.fillRect(bx, by, barW * hpPercent, barH);
        }

        ctx.restore();
    }
}
