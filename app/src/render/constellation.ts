import type { Constellation } from "../game/curriculum";
import type { Mastery } from "../game/mastery";
import { Spring, clamp, lerp, smoothstep } from "../core/spring";
import { withAlpha } from "./stage";

/**
 * The constellation view.
 *
 * This is the heart of the whole idea, so it gets more care than anything else on screen. A
 * constellation is a *fact family* — the six or eight facts that share a number bond. Each fact is
 * a star. Answering the fact lights the star. The picture only resolves when the family is whole.
 *
 * Design constraints learned the hard way from the first build:
 *
 *  - Unlit stars must be **clearly visible**. If the sockets are drawn at 16% alpha the screen just
 *    looks empty and broken, and the child has no idea what they are working toward. They now read
 *    as dim-but-present sockets, joined by a faint "ghost" of the finished shape.
 *  - A star that is *fading* (its memory decaying, per `mastery.ts`) must look different from one
 *    that was never lit — otherwise the child is punished invisibly. Fading stars keep their colour
 *    but lose their bloom and gain a slow pulse.
 *  - A **sealed** star (permanently mastered) gets a tiny fixed diamond sparkle so that "done
 *    forever" has its own visual language.
 */

interface StarVisual {
  x: number;
  y: number;
  /** Spring driving the pop when the star first lights. */
  pop: Spring;
  /** 0..1 current brightness, damped toward the mastery value. */
  bright: number;
  target: number;
  sealed: boolean;
  fading: boolean;
  twinkle: number;
}

export interface ConstellationViewOptions {
  /** Fraction of the smaller box dimension used as padding. */
  pad?: number;
}

export class ConstellationView {
  private stars: StarVisual[] = [];
  private constellation: Constellation | null = null;
  private time = 0;
  /** Index of the fact currently being asked, so it can be ringed. */
  private activeIndex = -1;
  private activeRing = new Spring(0, { duration: 0.5, bounce: 0.3 });
  /** 0..1 reveal of the joining lines; runs to 1 when the family completes. */
  private completion = 0;

  private readonly opts: ConstellationViewOptions;

  constructor(opts: ConstellationViewOptions = {}) {
    this.opts = opts;
  }

  setConstellation(c: Constellation | null, mastery: Mastery): void {
    this.constellation = c;
    this.activeIndex = -1;
    if (!c) {
      this.stars = [];
      return;
    }
    const now = Date.now();
    this.stars = c.facts.map((fact, i) => {
      const b = mastery.brightness(fact.id, now);
      return {
        x: c.stars[i]?.x ?? 0.5,
        y: c.stars[i]?.y ?? 0.5,
        pop: new Spring(b > 0 ? 1 : 0, { duration: 0.55, bounce: 0.45 }),
        bright: b,
        target: b,
        sealed: mastery.isSealed(fact.id),
        fading: mastery.isFading(fact.id, now),
        twinkle: (i * 137.5) % 360,
      };
    });
    this.completion = this.stars.every((s) => s.target > 0) ? 1 : 0;
  }

  /** Re-read mastery without resetting the animation state, so lighting a star animates. */
  sync(mastery: Mastery): void {
    if (!this.constellation) return;
    const now = Date.now();
    this.constellation.facts.forEach((fact, i) => {
      const s = this.stars[i];
      if (!s) return;
      const b = mastery.brightness(fact.id, now);
      if (s.target <= 0 && b > 0) s.pop.set(1);
      s.target = b;
      s.sealed = mastery.isSealed(fact.id);
      s.fading = mastery.isFading(fact.id, now);
    });
  }

  setActiveFact(index: number): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.activeRing.reset(0).set(1);
  }

  /** Screen position of a star, for launching particles from the keypad to the sky. */
  starScreenPos(index: number, box: Box): { x: number; y: number } | null {
    const s = this.stars[index];
    if (!s) return null;
    const m = this.metrics(box);
    return { x: m.x + s.x * m.w, y: m.y + s.y * m.h };
  }

  update(dt: number): void {
    this.time += dt;
    this.activeRing.step(dt);
    let all = this.stars.length > 0;
    for (const s of this.stars) {
      s.pop.step(dt);
      s.bright += (s.target - s.bright) * Math.min(1, dt * 5);
      if (s.target <= 0) all = false;
    }
    this.completion += ((all ? 1 : 0) - this.completion) * Math.min(1, dt * 2.4);
  }

  private metrics(box: Box) {
    const pad = (this.opts.pad ?? 0.08) * Math.min(box.w, box.h);
    return { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
  }

  draw(ctx: CanvasRenderingContext2D, box: Box): void {
    const c = this.constellation;
    if (!c) return;
    const m = this.metrics(box);
    const scale = Math.min(m.w, m.h);
    const pt = (i: number) => {
      const s = this.stars[i];
      return { x: m.x + s.x * m.w, y: m.y + s.y * m.h };
    };

    ctx.save();

    // ---- Ghost of the finished shape -------------------------------------------------------
    // Always visible. This is the promise: "this is what you're building."
    //
    // Drawn in cool white rather than the constellation's own colour: at the low alpha this needs,
    // a warm gold line over the purple sky mixes to a muddy olive that reads as a rendering bug.
    // Colour is the reward for lighting a star, so the unlit state is deliberately colourless.
    ctx.strokeStyle = withAlpha("#FFFFFF", 0.13);
    ctx.lineWidth = Math.max(1, scale * 0.006);
    ctx.setLineDash([scale * 0.022, scale * 0.03]);
    ctx.beginPath();
    for (const [a, b] of c.links) {
      if (!this.stars[a] || !this.stars[b]) continue;
      const p = pt(a);
      const q = pt(b);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- Lit links --------------------------------------------------------------------------
    // A link glows in proportion to the dimmer of the two stars it joins, so the picture assembles
    // gradually instead of snapping on.
    ctx.lineCap = "round";
    for (const [a, b] of c.links) {
      const sa = this.stars[a];
      const sb = this.stars[b];
      if (!sa || !sb) continue;
      const strength = Math.min(sa.bright, sb.bright);
      if (strength <= 0.02) continue;
      const p = pt(a);
      const q = pt(b);
      const g = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
      g.addColorStop(0, withAlpha(c.color, 0.75 * sa.bright));
      g.addColorStop(1, withAlpha(c.color, 0.75 * sb.bright));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1.2, scale * (0.008 + 0.006 * this.completion));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // ---- Completion bloom -------------------------------------------------------------------
    if (this.completion > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < this.stars.length; i++) {
        const p = pt(i);
        cx += p.x;
        cy += p.y;
      }
      cx /= this.stars.length;
      cy /= this.stars.length;
      const r = scale * 0.62;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = this.completion * 0.3 * (0.8 + Math.sin(this.time * 1.6) * 0.2);
      g.addColorStop(0, withAlpha(c.color, a));
      g.addColorStop(1, withAlpha(c.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- Stars ------------------------------------------------------------------------------
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const p = pt(i);
      const base = scale * 0.028;
      const twinkle = 0.85 + Math.sin(this.time * 1.9 + s.twinkle) * 0.15;
      // Fading stars breathe slowly — noticeable but not alarming.
      const fadePulse = s.fading ? 0.78 + Math.sin(this.time * 1.15 + i) * 0.22 : 1;
      const popScale = 1 + s.pop.velocity * 0.012 + smoothstep(0, 1, s.pop.value) * 0.0;

      if (s.bright <= 0.02) {
        // Socket: dim but unmistakably present, and cool rather than tinted, so that gaining
        // colour is itself the signal that the star has been lit.
        ctx.fillStyle = withAlpha("#FFFFFF", 0.2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = withAlpha("#FFFFFF", 0.26);
        ctx.lineWidth = Math.max(1, scale * 0.0035);
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const b = clamp(s.bright, 0, 1) * fadePulse;
        const r = base * lerp(0.75, 1.15, b) * popScale;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5.5);
        halo.addColorStop(0, withAlpha(c.color, 0.55 * b * twinkle));
        halo.addColorStop(0.4, withAlpha(c.color, 0.18 * b));
        halo.addColorStop(1, withAlpha(c.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = withAlpha("#FFFFFF", 0.55 + 0.45 * b);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        if (s.sealed) drawSeal(ctx, p.x, p.y, r * 2.9, c.color, twinkle);
      }

      if (i === this.activeIndex) {
        const t = this.activeRing.value;
        ctx.strokeStyle = withAlpha("#FFFFFF", 0.5 * t);
        ctx.lineWidth = Math.max(1.2, scale * 0.005);
        ctx.beginPath();
        ctx.arc(p.x, p.y, base * (1.9 + Math.sin(this.time * 2.4) * 0.16), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Static thumbnail used by the map and the Atlas. Kept as a pure function so those screens can
   * render dozens of constellations per frame without allocating view objects.
   */
  static drawStatic(
    ctx: CanvasRenderingContext2D,
    c: Constellation,
    box: Box,
    mastery: Mastery,
    opts: { pad?: number; dimUnlit?: number; time?: number } = {},
  ): void {
    const pad = (opts.pad ?? 0.12) * Math.min(box.w, box.h);
    const m = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
    const scale = Math.min(m.w, m.h);
    const now = Date.now();
    const time = opts.time ?? 0;
    const bright = c.facts.map((f) => mastery.brightness(f.id, now));
    const pt = (i: number) => ({ x: m.x + (c.stars[i]?.x ?? 0.5) * m.w, y: m.y + (c.stars[i]?.y ?? 0.5) * m.h });
    const dim = opts.dimUnlit ?? 0.22;

    ctx.save();
    ctx.lineCap = "round";
    for (const [a, b] of c.links) {
      if (a >= bright.length || b >= bright.length) continue;
      const p = pt(a);
      const q = pt(b);
      const strength = Math.min(bright[a], bright[b]);
      ctx.strokeStyle =
        strength <= 0.02
          ? withAlpha("#FFFFFF", dim * 0.5)
          : withAlpha(c.color, lerp(0.3, 0.72, strength));
      ctx.lineWidth = Math.max(1, scale * 0.018);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (let i = 0; i < bright.length; i++) {
      const p = pt(i);
      const b = bright[i];
      const r = scale * lerp(0.035, 0.06, b);
      if (b > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const twinkle = 0.85 + Math.sin(time * 1.7 + i * 1.9) * 0.15;
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        halo.addColorStop(0, withAlpha(c.color, 0.5 * b * twinkle));
        halo.addColorStop(1, withAlpha(c.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = b > 0.02 ? withAlpha("#FFFFFF", 0.55 + 0.45 * b) : withAlpha("#FFFFFF", dim + 0.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Four-point sparkle marking a permanently sealed star. */
function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, twinkle: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = withAlpha(color, 0.5 * twinkle);
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.5, y);
  ctx.moveTo(x + r * 0.5, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y - r * 0.5);
  ctx.moveTo(x, y + r * 0.5);
  ctx.lineTo(x, y + r);
  ctx.stroke();
  ctx.restore();
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
