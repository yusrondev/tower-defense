import { checkObstacleCollision } from "./map.js";

export class Bullet {
  constructor(x, y, dx, dy, power = 1) {
    this.id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.speed = 10; 
    this.power = power;
    // Base size 5.0 (power 1.0), Max size 10 (se-ukuran spell)
    this.size = Math.min(10, 3 + (power * 1.5)); 
    this.damage = 10 * power;
    this.active = true;
    this.color = null; // Explicit color support for sync
    this.onHit = null; // Callback untuk percikan
  }

  update() {
    this.x += this.dx * this.speed;
    this.y += this.dy * this.speed;
    
    // Deteksi Tabrakan
    const hitWall = this.x < 0 || this.x > 1800 || this.y < 0 || this.y > 900 || checkObstacleCollision(this);
    
    if (hitWall) {
      if (typeof this.onHit === "function") {
          this.onHit(this.x + this.size/2, this.y + this.size/2, this.color || this.getColor());
      }
      this.active = false;
    }
  }

  getColor() {
    if (this.color) return this.color;
    // Fallback if no specific color is set
    const p = this.power || 1;
    const t = Math.min(1.0, (p - 1.0) / 1.5);
    const r = Math.round(241 + (255 - 241) * t);
    const g = Math.round(196 + (71 - 196) * t);
    const b = Math.round(15 + (87 - 15) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  draw(ctx) {
    const color = this.color || this.getColor();
    ctx.save();
    
    // Glow effect kian kuat seiring power
    ctx.shadowBlur = 5 + (this.size * 1.2);
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.arc(this.x + this.size/2, this.y + this.size/2, this.size, 0, Math.PI*2);
    ctx.fill();

    // Core putih untuk efek "panas" di tengah peluru
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(this.x + this.size/2, this.y + this.size/2, this.size * 0.4, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }
}