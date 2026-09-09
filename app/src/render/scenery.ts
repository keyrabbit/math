import { damp } from "../core/spring";
import { makeRng } from "../core/rng";
import type { DrawContext } from "./stage";
import { glow, mixHex, sparkle, withAlpha } from "./stage";

export interface Biome {
  id: string;
  name: string;
  /** Sky gradient, top to horizon. */
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  /** Furthest to nearest terrain. */
  hills: string[];
  accent: string;
  deep: string;
  /** Ambient drone root, in semitones relative to C4. */
  droneRoot: number;
  starDensity: number;
}

export const BIOMES: Record<string, Biome> = {
  meadow: {
    id: "meadow",
    name: "Lantern Meadow",
    skyTop: "#241448",
    skyMid: "#4A2A6B",
    skyHorizon: "#B25E7A",
    hills: ["#3A2358", "#2C1B48", "#1E1338", "#150D28"],
    accent: "#FFB36B",
    deep: "#140C26",
    droneRoot: -12,
    starDensity: 1,
  },
  harbour: {
    id: "harbour",
    name: "Tideglass Harbour",
    skyTop: "#0D1E3D",
    skyMid: "#1B3C63",
    skyHorizon: "#4E8FA8",
    hills: ["#1D3B57", "#152D46", "#0F2135", "#0A1726"],
    accent: "#6FE3D2",
    deep: "#08121F",
    droneRoot: -10,
    starDensity: 1.2,
  },
  orchard: {
    id: "orchard",
    name: "Ember Orchard",
    skyTop: "#2A1330",
    skyMid: "#5C2440",
    skyHorizon: "#C87A4E",
    hills: ["#4A2138", "#38182C", "#280F20", "#1B0A16"],
    accent: "#FFA05C",
    deep: "#190A14",
    droneRoot: -14,
    starDensity: 0.9,
  },
  canyon: {
    id: "canyon",
    name: "Whisper Canyon",
    skyTop: "#1A1140",
    skyMid: "#3D2065",
    skyHorizon: "#7E4A86",
    hills: ["#3A2258", "#2B1943", "#1E1130", "#140B21"],
    accent: "#C08BFF",
    deep: "#120A21",
    droneRoot: -17,
    starDensity: 1.4,
  },
  observatory: {
    id: "observatory",
    name: "The Observatory",
    skyTop: "#070A22",
    skyMid: "#101A40",
    skyHorizon: "#26356B",
    hills: ["#1A2450", "#131A3C", "#0D1229", "#080B1B"],
    accent: "#8FD9FF",
    deep: "#050714",
    droneRoot: -19,
    starDensity: 1.8,
  },
};

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

interface HillLayer {
  points: number[];
  depth: number;
}

/**
 * The world backdrop.
 *
 * Depth is created with **atmospheric perspective** — each successive hill layer is mixed toward
 * the sky colour and moves less with the parallax offset — rather than with drop shadows or
 * outlines. That is what separates a game backdrop from a flat illustration, and it costs nothing
 * but a colour mix.
 *
 * A film-grain overlay and vignette sit on top of everything. Those two effects are, dispropor-
 * tionately, what makes a canvas scene stop looking like a web page.
 */
export class Scenery {
  private biome: Biome;
  private targetBiome: Biome;
  private blend = 1;
  private stars: Star[] = [];
  private layers: HillLayer[] = [];
  private grain: HTMLCanvasElement | null = null;
  private grainOffset = 0;
  private parallaxX = 0;
  private parallaxY = 0;
  private targetParallaxX = 0;
  private targetParallaxY = 0;
  private seed: number;
  private lastWidth = 0;

  constructor(biomeId: keyof typeof BIOMES = "meadow", seed = 1337) {
    this.biome = BIOMES[biomeId];
    this.targetBiome = this.biome;
    this.seed = seed;
  }

  setBiome(biomeId: string): void {
    const next = BIOMES[biomeId];
    if (!next || next.id === this.targetBiome.id) return;
    this.biome = this.currentBiome();
    this.targetBiome = next;
    this.blend = 0;
  }

  get current(): Biome {
    return this.targetBiome;
  }

  /** Pointer-driven parallax. Values are normalised -1..1. */
  setParallax(x: number, y: number): void {
    this.targetParallaxX = x;
    this.targetParallaxY = y;
  }

  private currentBiome(): Biome {
    if (this.blend >= 1) return this.targetBiome;
    const t = this.blend;
    const a = this.biome;
    const b = this.targetBiome;
    return {
      ...b,
      skyTop: mixHex(a.skyTop, b.skyTop, t),
      skyMid: mixHex(a.skyMid, b.skyMid, t),
      skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, t),
      hills: a.hills.map((h, i) => mixHex(h, b.hills[i], t)),
      accent: mixHex(a.accent, b.accent, t),
      deep: mixHex(a.deep, b.deep, t),
    };
  }

  private build(width: number, height: number): void {
    const rand = makeRng(this.seed);
    this.stars = [];
    const count = Math.round((width * height) / 5200);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: rand() * width,
        y: rand() * height * 0.72,
        size: 0.5 + rand() * 1.7,
        phase: rand() * Math.PI * 2,
        speed: 0.4 + rand() * 1.6,
      });
    }

    // Hill silhouettes: layered value-noise ridgelines.
    this.layers = [];
    const layerCount = 4;
    for (let l = 0; l < layerCount; l++) {
      const segments = 10 + l * 5;
      const points: number[] = [];
      const baseY = height * (0.52 + l * 0.1);
      const amp = height * (0.1 - l * 0.014);
      for (let i = 0; i <= segments; i++) {
        points.push(baseY - Math.abs(Math.sin(i * (1.3 + l * 0.7) + l * 2.1)) * amp - rand() * amp * 0.5);
      }
      this.layers.push({ points, depth: l });
    }

    this.buildGrain();
    this.lastWidth = width;
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
  }

  /** Sky + stars + hills. Draw before the characters. */
  drawBackground(c: DrawContext): void {
    const { ctx, width, height, elapsed } = c;
    if (this.stars.length === 0 || Math.abs(width - this.lastWidth) > 40) this.build(width, height);
    const b = this.currentBiome();

    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.85);
    sky.addColorStop(0, b.skyTop);
    sky.addColorStop(0.55, b.skyMid);
    sky.addColorStop(1, b.skyHorizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Horizon bloom — the light source that motivates the whole palette.
    glow(ctx, width * 0.5, height * 0.82, width * 0.7, b.skyHorizon, 0.45);

    // Stars twinkle at individually random rates so the sky never pulses in unison.
    const px = this.parallaxX;
    const py = this.parallaxY;
    for (const s of this.stars) {
      const tw = 0.35 + (Math.sin(elapsed * s.speed + s.phase) * 0.5 + 0.5) * 0.65;
      const fade = 1 - s.y / (height * 0.8);
      const alpha = tw * fade * b.starDensity * 0.85;
      if (alpha <= 0.02) continue;
      const sx = s.x + px * 6;
      const sy = s.y + py * 4;
      if (s.size > 1.5) {
        sparkle(ctx, sx, sy, s.size * 2.2, "#FFFFFF", alpha * 0.85);
      } else {
        ctx.fillStyle = withAlpha("#FFFFFF", alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Hill layers, far to near. Nearer layers move more (parallax) and are darker (aerial perspective).
    for (const layer of this.layers) {
      const depth = layer.depth;
      const shift = px * (6 + depth * 14);
      const rise = py * (2 + depth * 6);
      ctx.fillStyle = b.hills[depth];
      ctx.beginPath();
      const step = width / (layer.points.length - 1);
      ctx.moveTo(-40 + shift, height + 40);
      ctx.lineTo(-40 + shift, layer.points[0] + rise);
      for (let i = 1; i < layer.points.length; i++) {
        const x0 = (i - 1) * step + shift;
        const x1 = i * step + shift;
        const y0 = layer.points[i - 1] + rise;
        const y1 = layer.points[i] + rise;
        ctx.bezierCurveTo(x0 + step * 0.5, y0, x1 - step * 0.5, y1, x1, y1);
      }
      ctx.lineTo(width + 40 + shift, height + 40);
      ctx.closePath();
      ctx.fill();

      // A thin lit edge along each ridge catches the horizon light.
      ctx.strokeStyle = withAlpha(b.accent, 0.1 - depth * 0.02);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /** Grain + vignette. Draw last, over everything including the DOM-free game layer. */
  drawGrade(c: DrawContext): void {
    const { ctx, width, height } = c;
    const b = this.currentBiome();

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
    v.addColorStop(1, withAlpha(b.deep, 0.66));
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
