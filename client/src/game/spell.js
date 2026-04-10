export class Spell {
    constructor(x, y, type, id = null) {
        this.x = x;
        this.y = y;
        this.size = 20;
        this.type = type; // 'HP', 'ENERGY', 'POWER'
        this.active = true;
        this.bob = 0; // Animasi mengambang
        this.lifetime = 600; // 10 detik (60 FPS)
        this.id = id || (Date.now() + Math.random());
    }

    update() {
        this.bob += 0.1;
        if (this.lifetime > 0) this.lifetime--;
        if (this.lifetime <= 0) this.active = false;
    }

    draw(ctx) {
        if (!this.active) return;
        const offset = Math.sin(this.bob) * 5;
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2 + offset;

        ctx.save();

        // Aura Pendar
        let color = "#fff";
        if (this.type === 'HP') color = "#2ecc71";
        if (this.type === 'ENERGY') color = "#f1c40f";
        if (this.type === 'POWER') color = "#e74c3c";

        // Efek Memudar jika hampir habis
        const alpha = this.lifetime < 120 ? this.lifetime / 120 : 1.0;
        ctx.globalAlpha = alpha;

        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.arc(cx, cy, this.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Simbol
        ctx.fillStyle = "white";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        let symbol = "?";
        if (this.type === 'HP') symbol = "+";
        if (this.type === 'ENERGY') symbol = "⚡";
        if (this.type === 'POWER') symbol = "★";
        ctx.fillText(symbol, cx, cy + 5);

        ctx.restore();
    }
}
