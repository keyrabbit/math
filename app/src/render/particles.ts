import { Rng } from "../core/rng";
import { clamp01 } from "../core/spring";
import type { DrawContext } from "./stage";
import { glow, sparkle, withAlpha } from "./stage";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "pip" | "dust" | "ring" | "trail";
  rotation: number;
  spin: number;
  gravity: number;
  drag: number;
  /** Optional homing target — pips fly to the score counter rather than just fading. */
  target?: { x: number; y: number };
  homing: number;
}

/**
 * Particle system.
 *
 * Deliberately small and purpose-built rather than a general engine. Four behaviours cover
 * everything the game needs: floating ambient dust (world feels alive), pips that *home* toward
 * the HUD counter (reward feels earned and connects cause to effect), expanding rings (impact),
 * and trails.
 */
export class Particles {
  private items: Particle[] = [];
  private rng = new Rng(9001);
  private ambientTimer = 0;
  /** Hard cap so a burst spam can never tank the frame rate on a low-end tablet. */
  private readonly max = 420;

  get count(): number {
    return this.items.length;
  }

  private push(p: Particle): void {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(p);
  }

  /** Celebration burst — used on correct answers and star lights. */
  burst(x: number, y: number, opts: { count?: number; color?: string; speed?: number; target?: { x: number; y: number } } = {}): void {
    const count = opts.count ?? 18;
    const color = opts.color ?? "#FFD782";
    const speed = opts.speed ?? 240;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.rng.float(-0.2, 0.2);
      const v = speed * this.rng.float(0.45, 1.15);
      this.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 40,
        life: 0,
        maxLife: this.rng.float(0.7, 1.5),
        size: this.rng.float(2.5, 6),
        color,
        kind: "pip",
        rotation: this.rng.float(0, Math.PI),
        spin: this.rng.float(-4, 4),
        gravity: opts.target ? 0 : 220,
        drag: 1.6,
        target: opts.target,
        homing: opts.target ? 0 : 0,
      });
    }
  }

  /** Expanding shockwave ring. One per impact — more than one reads as noise. */
  ring(x: number, y: number, color = "#FFFFFF", size = 90): void {
    this.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.6,
      size,
      color,
      kind: "ring",
      rotation: 0,
      spin: 0,
      gravity: 0,
      drag: 0,
      homing: 0,
    });
  }

  /** Pips that fly to a HUD target. The homing ramps up so they arc rather than beeline. */
  collect(x: number, y: number, target: { x: number; y: number }, count = 6, color = "#FFD782"): void {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.float(0, Math.PI * 2);
      const v = this.rng.float(120, 260);
      this.push({
        x: x + this.rng.float(-8, 8),
        y: y + this.rng.float(-8, 8),
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: -i * 0.04,
        maxLife: this.rng.float(0.85, 1.15),
        size: this.rng.float(3, 5.5),
        color,
        kind: "pip",
        rotation: 0,
        spin: this.rng.float(-3, 3),
        gravity: 0,
        drag: 1.1,
        target,
        homing: 1,
      });
    }
  }

  /** Slow ambient motes. Called every frame; internally rate-limited. */
  ambient(dt: number, width: number, height: number, color: string): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 0.28;
    this.push({
      x: this.rng.float(-20, width + 20),
      y: height + 10,
      vx: this.rng.float(-14, 14),
      vy: this.rng.float(-26, -9),
      life: 0,
      maxLife: this.rng.float(6, 12),
      size: this.rng.float(1.2, 3),
      color,
      kind: "dust",
      rotation: 0,
      spin: this.rng.float(-0.6, 0.6),
      gravity: 0,
      drag: 0.05,
      homing: 0,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      if (p.life < 0) continue;
      if (p.life >= p.maxLife) {
        this.items.splice(i, 1);
        continue;
      }

      if (p.target && p.homing > 0) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Attraction strengthens over the particle's life, producing a natural arc-then-swoop.
        const pull = 1400 * clamp01(p.life / (p.maxLife * 0.45));
        p.vx += (dx / dist) * pull * dt;
        p.vy += (dy / dist) * pull * dt;
        if (dist < 18) {
          this.items.splice(i, 1);
          continue;
        }
      }

      p.vy += p.gravity * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      // Ambient motes drift sideways on a slow sine so they never fall in straight lines.
      if (p.kind === "dust") {
        p.x += Math.sin(p.life * 0.8 + p.rotation) * 8 * dt;
      }
    }
  }

  draw(c: DrawContext): void {
    const { ctx } = c;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.items) {
      if (p.life < 0) continue;
      const t = p.life / p.maxLife;
      switch (p.kind) {
        case "ring": {
          const r = p.size * (0.2 + t * 1.1);
          const alpha = (1 - t) * 0.5;
          ctx.strokeStyle = withAlpha(p.color, alpha);
          ctx.lineWidth = Math.max(0.5, 5 * (1 - t));
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "dust": {
          // Fade in and out so motes never pop into existence.
          const alpha = Math.sin(t * Math.PI) * 0.5;
          glow(ctx, p.x, p.y, p.size * 7, p.color, alpha * 0.5);
          ctx.fillStyle = withAlpha("#FFFFFF", alpha * 0.7);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          const alpha = 1 - t * t;
          const size = p.size * (1 - t * 0.35);
          glow(ctx, p.x, p.y, size * 5, p.color, alpha * 0.6);
          sparkle(ctx, p.x, p.y, size * 1.6, "#FFFFFF", alpha, p.rotation);
          break;
        }
      }
    }
    ctx.restore();
  }

  clear(): void {
    this.items = [];
  }
}
