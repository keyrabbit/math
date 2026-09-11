import type { Room } from "./scenery";
import { glow, withAlpha } from "./stage";

/**
 * The eight decorations, drawn into the room itself.
 *
 * Until now a decoration was a line of text on the summary screen and a tick in a list. The child
 * was told the bunting went up; they never saw it. That is the difference between a reward and a
 * receipt, and children can tell which one they have been given — a thing you are *told* you own
 * stops being interesting the moment the sentence ends.
 *
 * So every decoration is painted into the background of every room, permanently. The bakery a
 * child sees in week three is visibly not the bakery they started in: bunting over the window, a
 * lamp burning on the left wall, a cat asleep on the shelf, a copper oven throwing light up the
 * back wall. Nothing here is interactive and nothing here is ever taken away.
 *
 * Everything is positioned in normalised coordinates and kept to the periphery — the top band
 * above the title and the shelf line below the question — because the middle of the frame belongs
 * to the question. Alpha is deliberately low: this is scenery a child notices between questions,
 * not decoration competing with the maths.
 */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, r: Room, t: number) => void;

/** Warm brass, used by every metal fitting so the room reads as one set of objects. */
const BRASS = "#E9B168";
const BRASS_DARK = "#8A5A28";

export const DECOR_ART: Record<string, Painter> = {
  /**
   * Paper bunting, hung in a catenary across the top of the frame.
   *
   * The sag is `cosh`-shaped rather than parabolic, because a string hung between two points is a
   * catenary and a parabola always looks slightly like a smile drawn by hand.
   */
  bunting(ctx, w, h, _r, t) {
    const y0 = h * 0.045;
    const sag = h * 0.05;
    const at = (u: number): number => y0 + (Math.cosh((u - 0.5) * 3) - 1) * (sag / (Math.cosh(1.5) - 1));

    ctx.save();
    ctx.strokeStyle = withAlpha("#F3DCBB", 0.35);
    ctx.lineWidth = Math.max(1, w * 0.0015);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) ctx[i === 0 ? "moveTo" : "lineTo"]((i / 40) * w, at(i / 40));
    ctx.stroke();

    const colours = ["#E8A863", "#D96F6F", "#F3DCBB", "#8FBF9F"];
    const flags = 13;
    for (let i = 0; i < flags; i++) {
      const u = (i + 0.5) / flags;
      const x = u * w;
      const y = at(u);
      // A slow, per-flag phase so the whole line never flutters in unison.
      const tilt = Math.sin(t * 0.9 + i * 1.3) * 0.09;
      const size = w * 0.022;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.fillStyle = withAlpha(colours[i % colours.length], 0.5);
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, 0);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(0, size * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },

  /** A brass wall lamp on the left, with a real pool of light under it. */
  lamp(ctx, w, h, _r, t) {
    const x = w * 0.075;
    const y = h * 0.3;
    const s = Math.min(w, h) * 0.05;
    // The flicker is tiny and slow. Anything faster reads as a fault rather than a flame.
    const flicker = 0.86 + Math.sin(t * 2.1) * 0.05 + Math.sin(t * 5.7) * 0.03;

    ctx.save();
    glow(ctx, x, y + s * 0.8, s * 6, "#FFCE8A", 0.17 * flicker);

    ctx.strokeStyle = withAlpha(BRASS_DARK, 0.75);
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.1, y - s * 1.5);
    ctx.lineTo(x - s * 0.1, y - s * 0.5);
    ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.1, x + s * 0.3, y - s * 0.1);
    ctx.stroke();

    // Shade: a trapezium, wide side down.
    ctx.fillStyle = withAlpha(BRASS, 0.8);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, y - s * 0.15);
    ctx.lineTo(x + s * 0.6, y - s * 0.15);
    ctx.lineTo(x + s * 0.85, y + s * 0.55);
    ctx.lineTo(x - s * 0.2, y + s * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = withAlpha("#FFE9BE", 0.5 * flicker);
    ctx.beginPath();
    ctx.ellipse(x + s * 0.32, y + s * 0.55, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** A cat, curled and asleep on the near shelf. Breathing, because a still cat looks dead. */
  cat(ctx, w, h, r, t) {
    const x = w * 0.905;
    const y = h * 0.415;
    const s = Math.min(w, h) * 0.042;
    const breath = 1 + Math.sin(t * 1.1) * 0.02;

    shelfUnder(ctx, x, y, s * 1.9, r);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, breath);
    ctx.fillStyle = withAlpha(r.deep, 0.92);

    // Body: a fat comma.
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.45, s * 1.15, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head tucked to the left, with two ears.
    ctx.beginPath();
    ctx.arc(-s * 0.85, -s * 0.62, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 1.12, -s * 0.9);
    ctx.lineTo(-s * 1.02, -s * 1.35);
    ctx.lineTo(-s * 0.78, -s * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.95);
    ctx.lineTo(-s * 0.52, -s * 1.28);
    ctx.lineTo(-s * 0.38, -s * 0.88);
    ctx.closePath();
    ctx.fill();

    // Tail curled round the front.
    ctx.strokeStyle = withAlpha(r.deep, 0.92);
    ctx.lineWidth = s * 0.26;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 1.0, -s * 0.35);
    ctx.quadraticCurveTo(s * 1.5, -s * 0.1, s * 0.9, s * 0.05);
    ctx.stroke();
    ctx.restore();

    // Two slits of reflected lamplight, so the silhouette reads as a cat and not a loaf.
    ctx.save();
    ctx.fillStyle = withAlpha(r.accent, 0.32);
    ctx.beginPath();
    ctx.ellipse(x - s * 0.95, y - s * 0.66, s * 0.07, s * 0.035, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 0.7, y - s * 0.66, s * 0.07, s * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** A cuckoo clock on the right wall, permanently at almost opening time. */
  clock(ctx, w, h, _r, t) {
    const x = w * 0.915;
    const y = h * 0.265;
    const s = Math.min(w, h) * 0.045;

    ctx.save();
    // Gabled case.
    ctx.fillStyle = withAlpha("#4A2C17", 0.85);
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.9);
    ctx.lineTo(x - s, y - s * 0.5);
    ctx.lineTo(x, y - s * 1.15);
    ctx.lineTo(x + s, y - s * 0.5);
    ctx.lineTo(x + s, y + s * 0.9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = withAlpha("#F3DCBB", 0.8);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Hands at five to, which is what "always almost opening time" looks like.
    ctx.strokeStyle = withAlpha("#3A2113", 0.9);
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 0.36);
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * 0.24, y - s * 0.16);
    ctx.stroke();

    // The pendulum is the only moving part, and it keeps real time.
    const swing = Math.sin(t * 1.6) * 0.32;
    ctx.strokeStyle = withAlpha(BRASS, 0.7);
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.save();
    ctx.translate(x, y + s * 0.9);
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, s * 0.75);
    ctx.stroke();
    ctx.fillStyle = withAlpha(BRASS, 0.7);
    ctx.beginPath();
    ctx.arc(0, s * 0.82, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  /** A kitchen radio on the far shelf, with a lit dial. */
  radio(ctx, w, h, r, t) {
    const x = w * 0.072;
    const y = h * 0.455;
    const s = Math.min(w, h) * 0.038;

    shelfUnder(ctx, x, y, s * 1.6, r);

    ctx.save();
    ctx.fillStyle = withAlpha("#5A3A22", 0.92);
    ctx.beginPath();
    ctx.roundRect(x - s, y - s * 0.85, s * 2, s * 0.85, s * 0.2);
    ctx.fill();

    ctx.fillStyle = withAlpha(r.accent, 0.3 + Math.sin(t * 3) * 0.04);
    ctx.beginPath();
    ctx.roundRect(x - s * 0.78, y - s * 0.66, s * 0.95, s * 0.42, s * 0.08);
    ctx.fill();

    ctx.fillStyle = withAlpha(BRASS, 0.75);
    ctx.beginPath();
    ctx.arc(x + s * 0.55, y - s * 0.45, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** A striped awning across the top, under the bunting. */
  awning(ctx, w, h, r) {
    const top = h * 0.1;
    const drop = h * 0.075;
    const scallop = w / 11;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(w, top);
    ctx.lineTo(w, top + drop);
    for (let i = 11; i > 0; i--) {
      ctx.quadraticCurveTo((i - 0.5) * scallop, top + drop * 1.5, (i - 1) * scallop, top + drop);
    }
    ctx.closePath();
    ctx.clip();

    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = withAlpha(i % 2 === 0 ? "#D96F6F" : "#F3DCBB", 0.42);
      ctx.fillRect(i * scallop, top, scallop, drop * 1.6);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = withAlpha(r.accent, 0.18);
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(w, top);
    ctx.stroke();
    ctx.restore();
  },

  /** The big copper oven, low and centre, throwing light up the back wall. */
  oven(ctx, w, h, _r, t) {
    const x = w * 0.5;
    const y = h * 1.02;
    const rad = Math.min(w, h) * 0.3;
    // A slow breath in the fire, out of phase with the lamp so the room never pulses as one.
    const fire = 0.9 + Math.sin(t * 1.3 + 2) * 0.08;

    ctx.save();
    glow(ctx, x, y - rad * 0.35, rad * 2.4, "#FF9A47", 0.2 * fire);

    ctx.fillStyle = withAlpha("#3A2113", 0.9);
    ctx.beginPath();
    ctx.arc(x, y, rad, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = withAlpha("#C87B37", 0.55);
    ctx.lineWidth = Math.max(2, rad * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, rad, Math.PI, Math.PI * 2);
    ctx.stroke();

    // The open door.
    ctx.fillStyle = withAlpha("#FFB35C", 0.34 * fire);
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.62, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** The gold shop sign. The last thing bought, and the loudest. */
  sign(ctx, w, h, _r, t) {
    const x = w * 0.5;
    const y = h * 0.152;
    const s = Math.min(w, h) * 0.06;
    const shimmer = 0.62 + Math.sin(t * 0.8) * 0.08;

    ctx.save();
    glow(ctx, x, y, s * 5, BRASS, 0.1);

    ctx.fillStyle = withAlpha("#2A1809", 0.7);
    ctx.beginPath();
    ctx.roundRect(x - s * 2.6, y - s * 0.62, s * 5.2, s * 1.24, s * 0.3);
    ctx.fill();
    ctx.strokeStyle = withAlpha(BRASS, shimmer);
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.stroke();

    ctx.fillStyle = withAlpha(BRASS, shimmer);
    ctx.font = `800 ${s * 0.62}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CRUMB'S BAKERY", x, y + s * 0.04);
    ctx.restore();
  },
};

/**
 * A short plank under a shelf-standing decoration.
 *
 * The cat and the radio both sit above the painted shelf line, so without one they float in the
 * middle of the wall like stickers. One plank each is enough to make them objects in a room.
 */
function shelfUnder(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, r: Room): void {
  ctx.save();
  ctx.fillStyle = withAlpha(r.shelves[1], 0.95);
  ctx.beginPath();
  ctx.roundRect(x - half, y, half * 2, Math.max(2, half * 0.12), half * 0.05);
  ctx.fill();
  ctx.fillStyle = withAlpha(r.accent, 0.16);
  ctx.fillRect(x - half, y, half * 2, 1);
  ctx.restore();
}

/** Painted before the near shelves so the cat and radio can sit behind their crockery. */
export const BEHIND_SHELVES = new Set(["oven"]);
