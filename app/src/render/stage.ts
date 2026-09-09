import { ticker } from "../core/ticker";

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels — all game code works in these; DPR scaling is applied on the transform. */
  width: number;
  height: number;
  dt: number;
  elapsed: number;
}

export type Layer = (c: DrawContext) => void;

/**
 * The canvas stage.
 *
 * All the "world" (sky, parallax scenery, the Pipkin, particles, constellations) is drawn here,
 * while interactive UI lives in a DOM layer above it. That split is deliberate: canvas gives
 * gradients, glow, grain and particles that DOM can't do at 60fps, while DOM keeps text crisp,
 * selectable, focusable and readable by assistive technology.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layers: { z: number; fn: Layer }[] = [];
  private unsubscribe: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    window.addEventListener("resize", this.resize);
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    // Cap DPR at 2: beyond that the fill-rate cost of full-screen gradients outweighs any
    // visible gain, and low-end tablets are exactly the target hardware.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  };

  /** Lower z draws first. */
  add(fn: Layer, z = 0): () => void {
    const entry = { z, fn };
    this.layers.push(entry);
    this.layers.sort((a, b) => a.z - b.z);
    return () => {
      this.layers = this.layers.filter((l) => l !== entry);
    };
  }

  clearLayers(): void {
    this.layers = [];
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = ticker.add((dt, elapsed) => this.draw(dt, elapsed));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  destroy(): void {
    this.stop();
    this.ro?.disconnect();
    window.removeEventListener("resize", this.resize);
  }

  private draw(dt: number, elapsed: number): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const c: DrawContext = { ctx, width: this.width, height: this.height, dt, elapsed };
    for (const layer of this.layers) {
      ctx.save();
      layer.fn(c);
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ drawing helpers

/** Rounded rectangle path (Path2D.roundRect isn't universally available on older WebViews). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Radial glow. Used constantly — every light source in the game is one of these. Kept as a helper
 * so the falloff is identical everywhere, which is what makes the lighting read as consistent.
 */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1
): void {
  if (radius <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.4, withAlpha(color, alpha * 0.35));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** A four-point sparkle — reads as "star" far better than a circle at small sizes. */
export function sparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha = 1,
  rotation = 0
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.beginPath();
  const waist = size * 0.16;
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(waist, -waist, size, 0);
  ctx.quadraticCurveTo(waist, waist, 0, size);
  ctx.quadraticCurveTo(-waist, waist, -size, 0);
  ctx.quadraticCurveTo(-waist, -waist, 0, -size);
  ctx.fill();
  ctx.restore();
}

const hexCache = new Map<string, [number, number, number]>();

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba")) return color;
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  let rgb = hexCache.get(color);
  if (!rgb) {
    rgb = hexToRgb(color);
    hexCache.set(color, rgb);
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
