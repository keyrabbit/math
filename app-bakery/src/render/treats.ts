import type { TreatShape } from "../game/curriculum";
import { withAlpha } from "./stage";

/**
 * Procedural treats.
 *
 * Every treat in the game is drawn here, in code, from a handful of arcs and curves. None of them
 * is an image asset. That matters for three reasons:
 *
 *  1. **They stay crisp at any size.** The same function draws a 14px treat in a map thumbnail and
 *     a 90px treat on the Recipe Card.
 *  2. **They can be lit.** A treat's colour, gloss and sprinkles are all parameters, so freshness
 *     (see `mastery.ts`) can be rendered as an actual visual property rather than an opacity ramp
 *     over a flat PNG.
 *  3. **A new treat costs a function, not an art order.** Adding a croissant is twenty lines.
 *
 * Shapes are drawn in a unit box centred on (0,0) spanning roughly -1..1, then scaled by the
 * caller. Keeping them all the same nominal size is what makes a mixed shelf look plated rather
 * than randomly assembled.
 */

export interface TreatStyle {
  /** The recipe's icing colour. */
  color: string;
  /** 0..1 — from `mastery.freshness()`. 0 means not baked yet. */
  freshness: number;
  /** A house special: permanently fresh, and marked with a little gold gleam. */
  special: boolean;
  /** Past its freshness window and due for another bake. */
  stale: boolean;
  /** Seconds, for gentle idle motion. */
  time: number;
}

const DOUGH = "#E8C08A";
const DOUGH_DEEP = "#C9975E";
const CRUST = "#B0763C";
const CREAM = "#FFF3DC";

/** Everything a stale treat loses: gloss, saturation, and its sprinkles. */
function staleFade(style: TreatStyle): number {
  if (!style.stale) return 1;
  return 0.72 + Math.sin(style.time * 1.15) * 0.12;
}

/**
 * The empty plate a treat will one day stand on.
 *
 * Deliberately **clearly visible**, not a whisper. The sibling MVP learned this the hard way: at
 * 16% alpha an unbaked shelf just looks like an empty broken screen, and the child has no idea what
 * they are working toward. A dashed silhouette of the actual treat says "this is what you're
 * making" without giving away the reward, because colour is what the child is playing for.
 */
export function drawTreatGhost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: TreatShape
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.3);
  ctx.lineWidth = 0.075;
  ctx.lineJoin = "round";
  ctx.setLineDash([0.16, 0.14]);
  silhouette(ctx, shape);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Where each shape *rests*.
 *
 * In the unit space every treat is drawn in, the bottom of the shape is not the same y for all of
 * them — a cookie is a circle of radius 0.82, a bun is a dome that stops at 0.52. Without this the
 * shelf plank has to guess, and it saws through the middle of every cookie on the shelf.
 */
export const TREAT_BASE: Record<TreatShape, number> = {
  cupcake: 0.86,
  cookie: 0.82,
  doughnut: 0.84,
  pie: 0.78,
  bun: 0.52,
};

/** The outline used for the unbaked ghost — one simple readable profile per treat. */
function silhouette(ctx: CanvasRenderingContext2D, shape: TreatShape): void {
  ctx.beginPath();
  switch (shape) {
    case "cupcake":
      ctx.moveTo(-0.72, 0.1);
      ctx.lineTo(-0.52, 0.86);
      ctx.lineTo(0.52, 0.86);
      ctx.lineTo(0.72, 0.1);
      ctx.bezierCurveTo(0.72, -0.5, 0.42, -0.9, 0, -0.9);
      ctx.bezierCurveTo(-0.42, -0.9, -0.72, -0.5, -0.72, 0.1);
      ctx.closePath();
      break;
    case "cookie":
      ctx.arc(0, 0, 0.82, 0, Math.PI * 2);
      break;
    case "doughnut":
      ctx.arc(0, 0, 0.84, 0, Math.PI * 2);
      ctx.moveTo(0.3, 0);
      ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      break;
    case "pie":
      ctx.moveTo(0, 0.78);
      ctx.lineTo(-0.8, -0.5);
      ctx.quadraticCurveTo(0, -0.95, 0.8, -0.5);
      ctx.closePath();
      break;
    case "bun":
      ctx.moveTo(-0.84, 0.52);
      ctx.bezierCurveTo(-0.84, -0.5, -0.5, -0.82, 0, -0.82);
      ctx.bezierCurveTo(0.5, -0.82, 0.84, -0.5, 0.84, 0.52);
      ctx.closePath();
      break;
  }
}

/**
 * A baked treat.
 *
 * `style.freshness` drives saturation and gloss rather than plain alpha: a stale treat should look
 * like a day-old bun, not like a half-erased one.
 */
export function drawTreat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: TreatShape,
  style: TreatStyle
): void {
  const f = Math.max(0, Math.min(1, style.freshness)) * staleFade(style);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.globalAlpha = 0.55 + 0.45 * f;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (shape) {
    case "cupcake":
      cupcake(ctx, style, f);
      break;
    case "cookie":
      cookie(ctx, style, f);
      break;
    case "doughnut":
      doughnut(ctx, style, f);
      break;
    case "pie":
      pie(ctx, style, f);
      break;
    case "bun":
      bun(ctx, style, f);
      break;
  }

  if (style.special) gleam(ctx, style, f);
  ctx.restore();
}

function cupcake(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  // Wrapper
  ctx.fillStyle = withAlpha(DOUGH_DEEP, 0.95);
  ctx.beginPath();
  ctx.moveTo(-0.66, 0.06);
  ctx.lineTo(-0.48, 0.86);
  ctx.lineTo(0.48, 0.86);
  ctx.lineTo(0.66, 0.06);
  ctx.closePath();
  ctx.fill();
  // Wrapper pleats
  ctx.strokeStyle = withAlpha("#8A5C2E", 0.5);
  ctx.lineWidth = 0.05;
  for (const px of [-0.32, 0, 0.32]) {
    ctx.beginPath();
    ctx.moveTo(px * 1.05, 0.1);
    ctx.lineTo(px * 0.78, 0.84);
    ctx.stroke();
  }
  // Frosting swirl in the recipe's icing colour
  ctx.fillStyle = withAlpha(style.color, 0.92);
  ctx.beginPath();
  ctx.moveTo(-0.7, 0.1);
  ctx.bezierCurveTo(-0.74, -0.34, -0.44, -0.5, -0.2, -0.44);
  ctx.bezierCurveTo(-0.16, -0.8, 0.3, -0.88, 0.36, -0.5);
  ctx.bezierCurveTo(0.66, -0.54, 0.78, -0.22, 0.7, 0.1);
  ctx.closePath();
  ctx.fill();
  // Gloss — the single detail that makes frosting read as frosting
  ctx.fillStyle = withAlpha("#FFFFFF", 0.3 * f);
  ctx.beginPath();
  ctx.ellipse(-0.24, -0.34, 0.2, 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  sprinkles(ctx, style, f, [
    [-0.36, -0.1],
    [0.12, -0.24],
    [0.44, -0.06],
  ]);
}

function cookie(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  ctx.fillStyle = withAlpha(DOUGH, 0.96);
  ctx.beginPath();
  // A slightly wobbly circle: a perfectly round cookie looks like a button.
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 0.8 + Math.sin(a * 3 + 1.2) * 0.035;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(DOUGH_DEEP, 0.6);
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // Chips, tinted with the recipe colour so a shelf still reads as one batch.
  ctx.fillStyle = withAlpha(style.color, 0.9);
  for (const [cx, cy, r] of [
    [-0.3, -0.24, 0.15],
    [0.28, -0.14, 0.13],
    [-0.06, 0.3, 0.14],
    [0.34, 0.34, 0.1],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = withAlpha("#FFFFFF", 0.22 * f);
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.44, 0.24, 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function doughnut(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  ctx.fillStyle = withAlpha(DOUGH, 0.96);
  ctx.beginPath();
  ctx.arc(0, 0, 0.82, 0, Math.PI * 2);
  ctx.fill();
  // Icing cap with a drippy lower edge
  ctx.fillStyle = withAlpha(style.color, 0.94);
  ctx.beginPath();
  ctx.arc(0, 0, 0.82, Math.PI, Math.PI * 2);
  ctx.bezierCurveTo(0.82, 0.26, 0.5, 0.1, 0.28, 0.24);
  ctx.bezierCurveTo(0.04, 0.4, -0.26, 0.06, -0.5, 0.22);
  ctx.bezierCurveTo(-0.68, 0.32, -0.82, 0.16, -0.82, 0);
  ctx.closePath();
  ctx.fill();
  // Hole, punched out of both
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(0, 0, 0.29, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = withAlpha(DOUGH_DEEP, 0.55);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, 0.29, 0, Math.PI * 2);
  ctx.stroke();
  sprinkles(ctx, style, f, [
    [-0.42, -0.32],
    [0.02, -0.52],
    [0.44, -0.28],
    [-0.14, -0.16],
  ]);
}

function pie(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  // Filling wedge
  ctx.fillStyle = withAlpha(style.color, 0.94);
  ctx.beginPath();
  ctx.moveTo(0, 0.74);
  ctx.lineTo(-0.76, -0.44);
  ctx.quadraticCurveTo(0, -0.88, 0.76, -0.44);
  ctx.closePath();
  ctx.fill();
  // Crust along the outer arc — the edge that says "pie" rather than "triangle"
  ctx.strokeStyle = withAlpha(CRUST, 0.95);
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(-0.76, -0.44);
  ctx.quadraticCurveTo(0, -0.88, 0.76, -0.44);
  ctx.stroke();
  // Lattice, so the slice reads as baked rather than as a colour swatch
  ctx.strokeStyle = withAlpha(DOUGH, 0.75 * f + 0.2);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.44, -0.18);
  ctx.lineTo(0.22, 0.3);
  ctx.moveTo(0.44, -0.18);
  ctx.lineTo(-0.22, 0.3);
  ctx.stroke();
  ctx.fillStyle = withAlpha("#FFFFFF", 0.2 * f);
  ctx.beginPath();
  ctx.ellipse(-0.16, -0.42, 0.18, 0.07, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function bun(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  ctx.fillStyle = withAlpha(DOUGH, 0.97);
  ctx.beginPath();
  ctx.moveTo(-0.82, 0.5);
  ctx.bezierCurveTo(-0.82, -0.46, -0.48, -0.78, 0, -0.78);
  ctx.bezierCurveTo(0.48, -0.78, 0.82, -0.46, 0.82, 0.5);
  ctx.closePath();
  ctx.fill();
  // Base shadow grounds it on the shelf
  ctx.fillStyle = withAlpha(DOUGH_DEEP, 0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 0.82, 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glaze drizzle in the recipe colour
  ctx.strokeStyle = withAlpha(style.color, 0.92);
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  ctx.moveTo(-0.56, -0.24);
  ctx.quadraticCurveTo(-0.2, -0.5, 0.1, -0.22);
  ctx.quadraticCurveTo(0.38, 0.04, 0.62, -0.16);
  ctx.stroke();
  ctx.fillStyle = withAlpha(CREAM, 0.28 * f);
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.5, 0.22, 0.09, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Sprinkles are the first thing a treat loses as it goes stale, so they double as the fade cue. */
function sprinkles(
  ctx: CanvasRenderingContext2D,
  style: TreatStyle,
  f: number,
  points: [number, number][]
): void {
  if (f < 0.55) return;
  ctx.lineWidth = 0.075;
  points.forEach(([px, py], i) => {
    const a = i * 1.7;
    // Alternating cream and recipe colour. A single colour reads as a texture; two reads as
    // hundreds-and-thousands, which is what a five-year-old is actually looking for.
    ctx.strokeStyle = withAlpha(i % 2 === 0 ? CREAM : style.color, 0.85 * f);
    ctx.beginPath();
    ctx.moveTo(px - Math.cos(a) * 0.09, py - Math.sin(a) * 0.09);
    ctx.lineTo(px + Math.cos(a) * 0.09, py + Math.sin(a) * 0.09);
    ctx.stroke();
  });
}

/**
 * The house-special gleam.
 *
 * "Mastered forever" needs its own visual language, distinct from merely "fresh" — otherwise the
 * child has no way to see the difference between a treat they will be asked again and one they
 * have finished for good.
 */
function gleam(ctx: CanvasRenderingContext2D, style: TreatStyle, f: number): void {
  const tw = 0.72 + Math.sin(style.time * 1.9) * 0.28;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = withAlpha("#FFE9A8", 0.85 * tw * f);
  ctx.lineWidth = 0.075;
  ctx.lineCap = "round";
  const gx = 0.72;
  const gy = -0.72;
  const r = 0.26;
  ctx.beginPath();
  ctx.moveTo(gx - r, gy);
  ctx.lineTo(gx + r, gy);
  ctx.moveTo(gx, gy - r);
  ctx.lineTo(gx, gy + r);
  ctx.stroke();
  ctx.restore();
}
