import { damp } from "../core/spring";
import { makeRng } from "../core/rng";
import type { DrawContext } from "./stage";
import { glow, mixHex, withAlpha } from "./stage";
import { BEHIND_SHELVES, DECOR_ART } from "./decorArt";

export interface Room {
  id: string;
  name: string;
  /** Wall gradient, ceiling down to the worktop. */
  wallTop: string;
  wallMid: string;
  wallGlow: string;
  /** Furthest to nearest shelf silhouette. */
  shelves: string[];
  accent: string;
  deep: string;
  /** Ambient drone root, in semitones relative to C4. */
  droneRoot: number;
  /** How much flour hangs in the air here. */
  moteDensity: number;
}

/**
 * The five rooms of the bakery.
 *
 * The art direction is **"warm oven light"** — a cosy interior at the end of the day, lit by lamps
 * and the glow of an open oven door. This deliberately keeps the sibling MVP's lighting
 * architecture (a single warm light source low in the frame, atmospheric perspective, grain and
 * vignette) while inverting its mood: that game is a cool night sky, this one is the warmest room
 * in the house. Every palette below is a colour you would find in a kitchen — butter, crust,
 * copper, jam, icing — and never a night-sky blue.
 */
export const ROOMS: Record<string, Room> = {
  kitchen: {
    id: "kitchen",
    name: "The Little Kitchen",
    wallTop: "#3A2113",
    wallMid: "#6B3F1E",
    wallGlow: "#E8A863",
    shelves: ["#5A331A", "#472714", "#341C0E", "#241309"],
    accent: "#FFD08A",
    deep: "#1F1108",
    droneRoot: -12,
    moteDensity: 1,
  },
  pantry: {
    id: "pantry",
    name: "The Pantry",
    wallTop: "#2E1E14",
    wallMid: "#573521",
    wallGlow: "#C98A54",
    shelves: ["#4C2F1D", "#3B2416", "#2B1A10", "#1D110A"],
    accent: "#E8A75C",
    deep: "#180E07",
    droneRoot: -10,
    moteDensity: 1.3,
  },
  market: {
    id: "market",
    name: "The Morning Market",
    wallTop: "#431E1B",
    wallMid: "#7E3A24",
    wallGlow: "#F0955A",
    shelves: ["#6B2F20", "#532318", "#3C1911", "#28100B"],
    accent: "#FF9F62",
    deep: "#220D09",
    droneRoot: -14,
    moteDensity: 0.9,
  },
  bakehouse: {
    id: "bakehouse",
    name: "The Bakehouse",
    wallTop: "#3B120F",
    wallMid: "#75281A",
    wallGlow: "#FF8348",
    shelves: ["#612215", "#4A1810", "#34100A", "#210A06"],
    accent: "#FF8B54",
    deep: "#1C0705",
    droneRoot: -17,
    moteDensity: 1.5,
  },
  party: {
    id: "party",
    name: "The Party Room",
    wallTop: "#3B1B33",
    wallMid: "#6E3355",
    wallGlow: "#F5A0B8",
    shelves: ["#5E2B47", "#492036", "#351728", "#230F1B"],
    accent: "#FFB3D1",
    deep: "#1D0C16",
    droneRoot: -19,
    moteDensity: 1.8,
  },
};

/** A speck of flour or a stray sprinkle hanging in the warm air. */
interface Mote {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  /** Upward drift, px/s — warm air rises, and so does flour dust. */
  rise: number;
  drift: number;
}

/** What is standing on a shelf. Each has a distinct silhouette so the skyline never repeats. */
type CrockKind = "jar" | "bowl" | "bottle" | "tin";

interface Crock {
  /** Left edge, fraction of width. */
  x: number;
  /** Width, fraction of width. */
  w: number;
  /** Height above the plank, fraction of height. */
  h: number;
  kind: CrockKind;
}

interface ShelfLayer {
  /** Plank top, fraction of height. Flat — real shelving is a long horizontal, it does not step. */
  y: number;
  crocks: Crock[];
  depth: number;
}

/**
 * Trace one piece of crockery standing on a plank, as part of a larger silhouette path.
 *
 * The caller has already issued `lineTo(x0, y)`; this walks up the left side, over the top and
 * back down to `(x0 + w, y)`, leaving the cursor there. Each kind gets a genuinely different
 * profile — a shelf of identical shapes is what made the earlier version look architectural.
 */
function traceCrock(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y: number,
  w: number,
  h: number,
  kind: CrockKind,
): void {
  const x1 = x0 + w;
  switch (kind) {
    case "bowl": {
      // A wide shallow dome — a mixing bowl seen edge-on.
      ctx.quadraticCurveTo(x0 + w * 0.5, y - h * 2.4, x1, y);
      break;
    }
    case "bottle": {
      // Narrow body, a shoulder curve, then a thin neck with a lip.
      const neck = w * 0.42;
      const nx = x0 + (w - neck) / 2;
      const shoulder = y - h * 0.6;
      ctx.lineTo(x0, shoulder);
      ctx.quadraticCurveTo(x0, y - h * 0.82, nx, y - h * 0.86);
      ctx.lineTo(nx, y - h);
      ctx.lineTo(nx + neck, y - h);
      ctx.quadraticCurveTo(x1, y - h * 0.82, x1, shoulder);
      ctx.lineTo(x1, y);
      break;
    }
    case "tin": {
      // Short, wide, flat-lidded, with a small knob off-centre.
      const knob = w * 0.16;
      const kx = x0 + w * 0.34;
      ctx.lineTo(x0, y - h + w * 0.08);
      ctx.quadraticCurveTo(x0, y - h, x0 + w * 0.1, y - h);
      ctx.lineTo(kx, y - h);
      ctx.lineTo(kx, y - h - knob * 0.7);
      ctx.lineTo(kx + knob, y - h - knob * 0.7);
      ctx.lineTo(kx + knob, y - h);
      ctx.lineTo(x1 - w * 0.1, y - h);
      ctx.quadraticCurveTo(x1, y - h, x1, y - h + w * 0.08);
      ctx.lineTo(x1, y);
      break;
    }
    default: {
      // Jar: straight sides, rounded shoulder, a lid slightly wider than the body.
      const lip = w * 0.08;
      const shoulder = y - h + w * 0.3;
      ctx.lineTo(x0, shoulder);
      ctx.quadraticCurveTo(x0, y - h, x0 + w * 0.3, y - h);
      ctx.lineTo(x0 - lip + w * 0.3, y - h);
      ctx.lineTo(x0 - lip + w * 0.3, y - h - w * 0.12);
      ctx.lineTo(x1 + lip - w * 0.3, y - h - w * 0.12);
      ctx.lineTo(x1 + lip - w * 0.3, y - h);
      ctx.lineTo(x1 - w * 0.3, y - h);
      ctx.quadraticCurveTo(x1, y - h, x1, shoulder);
      ctx.lineTo(x1, y);
      break;
    }
  }
}

/**
 * The room backdrop.
 *
 * Depth is created with **atmospheric perspective** — each successive shelf layer is mixed toward
 * the wall colour and moves less with the parallax offset — rather than with drop shadows or
 * outlines. That is what separates a game backdrop from a flat illustration, and it costs nothing
 * but a colour mix.
 *
 * The silhouettes are **dead-flat shelf planks carrying jars, bowls, bottles and tins**, not the
 * rolling hills of the sibling MVP. The distinction carries most of the re-theme on its own: a
 * horizon of soft curves reads as landscape, a long horizontal broken by lids and necks reads as
 * indoors.
 *
 * A film-grain overlay and vignette sit on top of everything. Those two effects are,
 * disproportionately, what makes a canvas scene stop looking like a web page.
 */
export class Scenery {
  private room: Room;
  private targetRoom: Room;
  private blend = 1;
  private motes: Mote[] = [];
  private layers: ShelfLayer[] = [];
  private grain: HTMLCanvasElement | null = null;
  private grainOffset = 0;
  private parallaxX = 0;
  private parallaxY = 0;
  private targetParallaxX = 0;
  private targetParallaxY = 0;
  private seed: number;
  private lastWidth = 0;
  private lastHeight = 0;
  /** Decoration ids the child has earned, in `DECOR` order. */
  private decor: string[] = [];

  constructor(roomId: keyof typeof ROOMS = "kitchen", seed = 1337) {
    this.room = ROOMS[roomId];
    this.targetRoom = this.room;
    this.seed = seed;
  }

  setRoom(roomId: string): void {
    const next = ROOMS[roomId];
    if (!next || next.id === this.targetRoom.id) return;
    this.room = this.currentRoom();
    this.targetRoom = next;
    this.blend = 0;
  }

  get current(): Room {
    return this.targetRoom;
  }

  /**
   * Which decorations are standing in the room.
   *
   * Called on every screen that draws the bakery, from the child's lifetime sprinkle total. The
   * whole point of the currency is that the room changes, so the room has to be told.
   */
  setDecor(ids: string[]): void {
    this.decor = ids;
  }

  /** Pointer-driven parallax. Values are normalised -1..1. */
  setParallax(x: number, y: number): void {
    this.targetParallaxX = x;
    this.targetParallaxY = y;
  }

  private currentRoom(): Room {
    if (this.blend >= 1) return this.targetRoom;
    const t = this.blend;
    const a = this.room;
    const b = this.targetRoom;
    return {
      ...b,
      wallTop: mixHex(a.wallTop, b.wallTop, t),
      wallMid: mixHex(a.wallMid, b.wallMid, t),
      wallGlow: mixHex(a.wallGlow, b.wallGlow, t),
      shelves: a.shelves.map((h, i) => mixHex(h, b.shelves[i], t)),
      accent: mixHex(a.accent, b.accent, t),
      deep: mixHex(a.deep, b.deep, t),
    };
  }

  private build(width: number, height: number): void {
    const rand = makeRng(this.seed);
    this.motes = [];
    const count = Math.round((width * height) / 6400);
    for (let i = 0; i < count; i++) {
      this.motes.push({
        x: rand() * width,
        y: rand() * height * 0.86,
        size: 0.6 + rand() * 1.8,
        phase: rand() * Math.PI * 2,
        speed: 0.3 + rand() * 1.1,
        rise: 3 + rand() * 12,
        drift: (rand() - 0.5) * 8,
      });
    }

    // Shelf silhouettes: flat planks carrying jars, bowls, bottles and tins.
    //
    // Two earlier passes stepped the plank height up and down between runs, and both read
    // unmistakably as castle battlements — a regular up-down rhythm at a constant amplitude is
    // exactly what crenellation is. The fix is to remove the steps entirely: each plank is one
    // dead-flat horizontal, and *all* of the silhouette interest comes from the varied crockery
    // standing on it. Long horizontals broken by objects of different heights is what shelving
    // actually looks like.
    this.layers = [];
    const kinds: CrockKind[] = ["jar", "bowl", "bottle", "tin", "jar", "tin"];
    const layerCount = 4;
    for (let l = 0; l < layerCount; l++) {
      const crocks: Crock[] = [];
      // Nearer layers are lower and carry taller, wider crockery.
      const scale = 0.7 + l * 0.16;
      let x = -0.05;
      let guard = 0;
      while (x < 1.05 && guard++ < 60) {
        // A gap first, so the plank is visible between objects rather than lined solid.
        x += (0.02 + rand() * 0.09) * scale;
        const kind = kinds[Math.floor(rand() * kinds.length)];
        const w = (kind === "bottle" ? 0.018 : kind === "bowl" ? 0.05 : 0.032) * (0.7 + rand() * 0.8) * scale;
        const h = (kind === "bottle" ? 0.075 : kind === "bowl" ? 0.022 : kind === "tin" ? 0.028 : 0.05) *
          (0.7 + rand() * 0.7) * scale;
        crocks.push({ x, w, h, kind });
        x += w;
      }
      this.layers.push({ y: 0.56 + l * 0.1, crocks, depth: l });
    }

    this.buildGrain();
    this.lastWidth = width;
    this.lastHeight = height;
  }

  /**
   * Pre-rendered grain tile. Regenerating noise every frame is expensive; instead one tile is
   * generated once and scrolled by a random offset each frame, which reads as animated grain.
   */
  private buildGrain(): void {
    const size = 160;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    if (!g) return;
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.grain = c;
  }

  update(dt: number): void {
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt * 0.6);
    this.parallaxX = damp(this.parallaxX, this.targetParallaxX, 4, dt);
    this.parallaxY = damp(this.parallaxY, this.targetParallaxY, 4, dt);
    this.grainOffset += dt;

    // Flour rises, wraps, and comes back. Cheaper and calmer than respawning particles.
    const h = this.lastHeight || 1;
    for (const m of this.motes) {
      m.y -= m.rise * dt;
      m.x += m.drift * dt;
      if (m.y < -8) {
        m.y = h * 0.92 + Math.random() * 40;
        m.x = Math.random() * (this.lastWidth || 1);
      }
    }
  }

  /** Wall + flour motes + shelves. Draw before the characters. */
  drawBackground(c: DrawContext): void {
    const { ctx, width, height, elapsed } = c;
    if (this.motes.length === 0 || Math.abs(width - this.lastWidth) > 40) this.build(width, height);
    this.lastHeight = height;
    const r = this.currentRoom();

    const wall = ctx.createLinearGradient(0, 0, 0, height * 0.9);
    wall.addColorStop(0, r.wallTop);
    wall.addColorStop(0.55, r.wallMid);
    wall.addColorStop(1, r.wallGlow);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, width, height);

    // The oven/lamp light low in the frame — the light source that motivates the whole palette.
    glow(ctx, width * 0.5, height * 0.84, width * 0.72, r.wallGlow, 0.5);

    const px = this.parallaxX;
    const py = this.parallaxY;

    // Decorations that belong to the architecture go behind the shelving, so the oven's light
    // spills up *past* the crockery rather than over it.
    this.paintDecor(c, r, true);

    // Flour motes catch the light. They twinkle at individually random rates so the air never
    // pulses in unison.
    for (const m of this.motes) {
      const tw = 0.3 + (Math.sin(elapsed * m.speed + m.phase) * 0.5 + 0.5) * 0.7;
      const fade = 1 - Math.max(0, m.y) / (height * 1.1);
      const alpha = tw * fade * r.moteDensity * 0.5;
      if (alpha <= 0.02) continue;
      ctx.fillStyle = withAlpha("#FFE7C4", alpha);
      ctx.beginPath();
      ctx.arc(m.x + px * 6, m.y + py * 4, m.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shelf layers, far to near. Nearer layers move more (parallax) and are darker (aerial
    // perspective).
    for (const layer of this.layers) {
      const depth = layer.depth;
      const shift = px * (6 + depth * 14);
      const rise = py * (2 + depth * 6);
      const y = layer.y * height + rise;
      ctx.fillStyle = r.shelves[depth];
      ctx.beginPath();
      ctx.moveTo(-60 + shift, height + 40);
      ctx.lineTo(-60 + shift, y);
      for (const crock of layer.crocks) {
        const x0 = crock.x * width + shift;
        const w = crock.w * width;
        const h = crock.h * height;
        ctx.lineTo(x0, y);
        traceCrock(ctx, x0, y, w, h, crock.kind);
        ctx.lineTo(x0 + w, y);
      }
      ctx.lineTo(width + 60 + shift, y);
      ctx.lineTo(width + 60 + shift, height + 40);
      ctx.closePath();
      ctx.fill();

      // A thin lit edge along each shelf front catches the oven light.
      ctx.strokeStyle = withAlpha(r.accent, 0.14 - depth * 0.025);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    this.paintDecor(c, r, false);
  }

  /**
   * Paint the earned decorations.
   *
   * Split either side of the shelving rather than drawn in one pass, because the oven is part of
   * the back wall and everything else stands in the room. Wrapped in save/restore per item so one
   * painter leaving a clip or a transform behind cannot corrupt the next.
   */
  private paintDecor(c: DrawContext, r: Room, behind: boolean): void {
    if (this.decor.length === 0) return;
    const { ctx, width, height, elapsed } = c;
    for (const id of this.decor) {
      if (BEHIND_SHELVES.has(id) !== behind) continue;
      const paint = DECOR_ART[id];
      if (!paint) continue;
      ctx.save();
      paint(ctx, width, height, r, elapsed);
      ctx.restore();
    }
  }

  /** Grain + vignette. Draw last, over everything including the game layer. */
  drawGrade(c: DrawContext): void {
    const { ctx, width, height } = c;
    const r = this.currentRoom();

    // Vignette focuses attention centrally without darkening the play area itself.
    const v = ctx.createRadialGradient(
      width / 2,
      height * 0.52,
      Math.min(width, height) * 0.32,
      width / 2,
      height * 0.52,
      Math.max(width, height) * 0.78
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, withAlpha(r.deep, 0.66));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);

    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.032;
      ctx.globalCompositeOperation = "overlay";
      const ox = (Math.sin(this.grainOffset * 40) * 80) | 0;
      const oy = (Math.cos(this.grainOffset * 37) * 80) | 0;
      const pattern = ctx.createPattern(this.grain, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.translate(ox, oy);
        ctx.fillRect(-ox, -oy, width + 200, height + 200);
      }
      ctx.restore();
    }
  }
}
