import type { Recipe } from "../game/curriculum";
import type { Mastery } from "../game/mastery";
import { Spring, clamp, lerp, smoothstep } from "../core/spring";
import { withAlpha } from "./stage";
import { drawTreat, drawTreatGhost, TREAT_BASE } from "./treats";

/**
 * The shelf view — Crumb's Bakery's answer to the fact-family ladder.
 *
 * This is the heart of the whole idea, so it gets more care than anything else on screen. A recipe
 * is a *fact family* — the six or eight facts that share a number bond. Each fact is a treat.
 * Answering the fact bakes the treat and it appears on the shelf. The shelf is only full when the
 * family is whole.
 *
 * Design constraints inherited from the sibling MVP, which learned all three the hard way:
 *
 *  - Unbaked slots must be **clearly visible**. Drawn at 16% alpha the shelf just looks empty and
 *    broken, and the child cannot see what they are working toward. They read here as dashed
 *    silhouettes of the actual treat — the shape is the promise, the colour is the reward.
 *  - A treat that is *going stale* (its memory decaying, per `mastery.ts`) must look different from
 *    one that was never baked — otherwise the child is penalised invisibly. Stale treats keep their
 *    shape and colour but lose their gloss and sprinkles, and breathe slowly.
 *  - A **house special** (permanently mastered) gets a small gold gleam, so "finished for good" has
 *    its own visual language.
 *
 * Where the sibling MVP joined its stars with constellation lines, this joins its treats with
 * **shelf planks**. That is not just a reskin: a plank per row means a bond family plates with its
 * four additions directly above the four subtractions that undo them, so the inverse relationship
 * is something the child can see rather than something the copy claims.
 */

interface TreatVisual {
  x: number;
  y: number;
  row: number;
  /** Spring driving the pop when the treat first comes out of the oven. */
  pop: Spring;
  /** 0..1 current freshness, damped toward the mastery value. */
  fresh: number;
  target: number;
  special: boolean;
  stale: boolean;
  /** Per-treat phase so a shelf never bobs in unison. */
  phase: number;
}

export interface ShelfViewOptions {
  /** Fraction of the smaller box dimension used as padding. */
  pad?: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Warm wood, for the planks the treats stand on. */
const PLANK = "#7A4B2A";
const PLANK_LIT = "#C98A4E";

export class ShelfView {
  private treats: TreatVisual[] = [];
  private recipe: Recipe | null = null;
  private time = 0;
  /** Index of the fact currently being asked, so its plate can be spotlit. */
  private activeIndex = -1;
  private activePlate = new Spring(0, { duration: 0.5, bounce: 0.3 });
  /** 0..1 reveal of the "fresh out of the oven" bloom; runs to 1 when the family completes. */
  private completion = 0;

  private readonly opts: ShelfViewOptions;

  constructor(opts: ShelfViewOptions = {}) {
    this.opts = opts;
  }

  setRecipe(r: Recipe | null, mastery: Mastery): void {
    this.recipe = r;
    this.activeIndex = -1;
    if (!r) {
      this.treats = [];
      return;
    }
    const now = Date.now();
    this.treats = r.facts.map((fact, i) => {
      const f = mastery.freshness(fact.id, now);
      const slot = r.treats[i];
      return {
        x: slot?.x ?? 0.5,
        y: slot?.y ?? 0.5,
        row: slot?.row ?? 0,
        pop: new Spring(f > 0 ? 1 : 0, { duration: 0.55, bounce: 0.45 }),
        fresh: f,
        target: f,
        special: mastery.isSpecial(fact.id),
        stale: mastery.isStale(fact.id, now),
        phase: (i * 137.5) % 360,
      };
    });
    this.completion = this.treats.every((t) => t.target > 0) ? 1 : 0;
  }

  /** Re-read mastery without resetting animation state, so a new bake animates in. */
  sync(mastery: Mastery): void {
    if (!this.recipe) return;
    const now = Date.now();
    this.recipe.facts.forEach((fact, i) => {
      const t = this.treats[i];
      if (!t) return;
      const f = mastery.freshness(fact.id, now);
      if (t.target <= 0 && f > 0) t.pop.set(1);
      t.target = f;
      t.special = mastery.isSpecial(fact.id);
      t.stale = mastery.isStale(fact.id, now);
    });
  }

  setActiveFact(index: number): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.activePlate.reset(0).set(1);
  }

  /** Screen position of a treat, for flying sprinkles from the keypad to the shelf. */
  treatScreenPos(index: number, box: Box): { x: number; y: number } | null {
    const t = this.treats[index];
    if (!t) return null;
    const m = this.metrics(box);
    return { x: m.x + t.x * m.w, y: m.y + t.y * m.h };
  }

  update(dt: number): void {
    this.time += dt;
    this.activePlate.step(dt);
    let all = this.treats.length > 0;
    for (const t of this.treats) {
      t.pop.step(dt);
      t.fresh += (t.target - t.fresh) * Math.min(1, dt * 5);
      if (t.target <= 0) all = false;
    }
    this.completion += ((all ? 1 : 0) - this.completion) * Math.min(1, dt * 2.4);
  }

  private metrics(box: Box) {
    const pad = (this.opts.pad ?? 0.08) * Math.min(box.w, box.h);
    return { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
  }

  draw(ctx: CanvasRenderingContext2D, box: Box): void {
    const r = this.recipe;
    if (!r || this.treats.length === 0) return;
    const m = this.metrics(box);
    const rows = Math.max(1, r.rows);
    const rowHeight = m.h / rows;
    // Treats are sized off the tighter of the two axes so a wide shelf doesn't produce giant
    // cupcakes and a narrow one doesn't produce crumbs.
    const cols = Math.max(1, Math.round(1 / Math.max(0.001, minGap(this.treats))));
    const size = Math.min(rowHeight * 0.34, (m.w / cols) * 0.36);

    const pt = (i: number) => {
      const t = this.treats[i];
      return { x: m.x + t.x * m.w, y: m.y + t.y * m.h };
    };

    ctx.save();

    // ---- Shelf planks ------------------------------------------------------------------------
    // One plank per row, always drawn. This is the "here is the shape of the job" promise that the
    // dashed ghosts sit on top of.
    for (let row = 0; row < rows; row++) {
      const rowIdx = this.treats.map((_, i) => i).filter((i) => this.treats[i].row === row);
      if (rowIdx.length === 0) continue;
      const rowTreats = rowIdx.map((i) => this.treats[i]);
      const base = TREAT_BASE[r.treats[rowIdx[0]]?.shape ?? "cookie"];
      const ys = m.y + ((row + 0.5) / rows) * m.h + size * base;
      const xs = rowTreats.map((t) => m.x + t.x * m.w);
      const x0 = Math.min(...xs) - size * 1.15;
      const x1 = Math.max(...xs) + size * 1.15;

      // How lit the plank is tracks how full it is — the shelf itself reports progress.
      const rowFresh =
        rowTreats.reduce((sum, t) => sum + clamp(t.fresh, 0, 1), 0) / rowTreats.length;

      const h = Math.max(2, size * 0.15);
      const g = ctx.createLinearGradient(0, ys, 0, ys + h);
      g.addColorStop(0, withAlpha(PLANK_LIT, 0.35 + 0.5 * rowFresh));
      g.addColorStop(1, withAlpha(PLANK, 0.5 + 0.3 * rowFresh));
      ctx.fillStyle = g;
      ctx.fillRect(x0, ys, x1 - x0, h);

      // A warm highlight along the front edge catches the room's light.
      ctx.fillStyle = withAlpha("#FFD9A0", 0.12 + 0.22 * rowFresh);
      ctx.fillRect(x0, ys, x1 - x0, Math.max(1, h * 0.3));
    }

    // ---- Completion bloom --------------------------------------------------------------------
    // "Fresh out of the oven" — a warm wash over the finished shelf.
    if (this.completion > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < this.treats.length; i++) {
        const p = pt(i);
        cx += p.x;
        cy += p.y;
      }
      cx /= this.treats.length;
      cy /= this.treats.length;
      const rad = Math.max(m.w, m.h) * 0.55;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const a = this.completion * 0.3 * (0.8 + Math.sin(this.time * 1.6) * 0.2);
      g.addColorStop(0, withAlpha(r.color, a));
      g.addColorStop(1, withAlpha(r.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- Treats ------------------------------------------------------------------------------
    for (let i = 0; i < this.treats.length; i++) {
      const t = this.treats[i];
      const slot = r.treats[i];
      const p = pt(i);

      if (i === this.activeIndex) {
        // The plate under the treat being asked about.
        //
        // It has to be a *plate*: a tight lit ellipse sitting on the plank, with a short cone of
        // light above it. An earlier build used a big soft radial blob, which at this scale just
        // washed a grey lens across a third of the shelf and read as a rendering artefact rather
        // than as "your turn". A ring around the empty slot was the other candidate and is worse —
        // a ring around nothing reads as an error state.
        const k = this.activePlate.value;
        const pulse = 0.72 + Math.sin(this.time * 2.4) * 0.28;
        const plateY =
          m.y +
          ((t.row + 0.5) / rows) * m.h +
          size * TREAT_BASE[slot?.shape ?? "cookie"];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        const cone = ctx.createLinearGradient(0, plateY - size * 1.5, 0, plateY);
        cone.addColorStop(0, withAlpha("#FFE3B0", 0));
        cone.addColorStop(1, withAlpha("#FFE3B0", 0.13 * k * pulse));
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(p.x - size * 0.42, plateY - size * 1.5);
        ctx.lineTo(p.x + size * 0.42, plateY - size * 1.5);
        ctx.lineTo(p.x + size * 1.0, plateY);
        ctx.lineTo(p.x - size * 1.0, plateY);
        ctx.closePath();
        ctx.fill();

        const g = ctx.createRadialGradient(p.x, plateY, 0, p.x, plateY, size * 0.9);
        g.addColorStop(0, withAlpha("#FFE9C2", 0.42 * k * pulse));
        g.addColorStop(0.6, withAlpha("#FFD08A", 0.16 * k * pulse));
        g.addColorStop(1, withAlpha("#FFD08A", 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, plateY, size * 0.9, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (t.fresh <= 0.02) {
        drawTreatGhost(ctx, p.x, p.y, size, slot?.shape ?? "cookie");
        continue;
      }

      const f = clamp(t.fresh, 0, 1);
      // Squash-and-stretch out of the oven, plus a barely-there idle bob so a full shelf is never
      // completely static.
      const pop = 1 + t.pop.velocity * 0.02 + smoothstep(0, 1, t.pop.value) * 0;
      const bob = Math.sin(this.time * 1.3 + t.phase) * size * 0.02;

      // Warm halo under fresh treats — the game's one consistent "this is good" signal.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.6);
      halo.addColorStop(0, withAlpha(r.color, 0.3 * f));
      halo.addColorStop(1, withAlpha(r.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawTreat(ctx, p.x, p.y + bob, size * pop, slot?.shape ?? "cookie", {
        color: r.color,
        freshness: f,
        special: t.special,
        stale: t.stale,
        time: this.time + t.phase,
      });
    }

    ctx.restore();
  }

  /**
   * Static thumbnail used by the map and the Bakery Case. Kept as a pure function so those screens
   * can render dozens of recipes per frame without allocating view objects.
   */
  static drawStatic(
    ctx: CanvasRenderingContext2D,
    r: Recipe,
    box: Box,
    mastery: Mastery,
    opts: { pad?: number; dimUnbaked?: number; time?: number; fit?: "box" | "circle" } = {}
  ): void {
    if (r.treats.length === 0) return;
    const pad = (opts.pad ?? 0.12) * Math.min(box.w, box.h);
    const m = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
    const now = Date.now();
    const time = opts.time ?? 0;
    const fresh = r.facts.map((f) => mastery.freshness(f.id, now));

    // Fit the actual plated bounds rather than assuming they span the full 0..1 design space.
    // A shelf drawn into a *circular* map node has to be scaled by its bounding radius, because a
    // shape that fits a square does not fit the circle inscribed in it.
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    const xs = r.treats.map((t) => t.x);
    const ys = r.treats.map((t) => t.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-3);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-3);

    let k: number;
    if (opts.fit === "circle") {
      let rad = 1e-3;
      for (const t of r.treats) rad = Math.max(rad, Math.hypot(t.x - midX, t.y - midY));
      // 0.78 leaves room for the treats themselves, which extend well past their centre points.
      k = ((Math.min(m.w, m.h) / 2) * 0.78) / (rad + 0.16);
    } else {
      k = Math.min(m.w / (spanX + 0.3), m.h / (spanY + 0.4));
    }

    const cols = Math.max(1, Math.round(1 / Math.max(0.001, minGapSlots(r.treats))));
    let size = Math.max(
      2,
      Math.min((k * 1.0) / cols, (Math.min(m.w, m.h) / Math.max(2, r.rows)) * 0.3)
    );

    // Second pass: shrink until the *drawn* extent fits.
    //
    // Scaling by the slot centres alone is not enough — a treat is drawn roughly a full `size`
    // beyond its own centre, so the naive fit spills dashed ghosts outside a map node's disc.
    // Measuring the real extent (centres + treat radius) and rescaling both k and size together is
    // the only version that holds for every row/column count in the curriculum.
    let radius = 1e-3;
    for (const t of r.treats) radius = Math.max(radius, Math.hypot(t.x - midX, t.y - midY));
    const limit = (Math.min(m.w, m.h) / 2) * 0.98;
    const extent = radius * k + size * 0.95;
    if (extent > limit) {
      const shrink = limit / extent;
      k *= shrink;
      size = Math.max(1.5, size * shrink);
    }

    const pt = (i: number) => {
      const t = r.treats[i];
      if (!t) return { x: cx, y: cy };
      return { x: cx + (t.x - midX) * k, y: cy + (t.y - midY) * k };
    };
    const dim = opts.dimUnbaked ?? 0.22;

    ctx.save();

    // Planks first, so unbaked shelves still read as a bakery rather than as empty space.
    for (let row = 0; row < r.rows; row++) {
      const idx = r.treats.map((t, i) => ({ t, i })).filter(({ t }) => t.row === row);
      if (idx.length === 0) continue;
      const pts = idx.map(({ i }) => pt(i));
      const ys2 = pts[0].y + size * TREAT_BASE[r.treats[idx[0].i]?.shape ?? "cookie"];
      const x0 = Math.min(...pts.map((p) => p.x)) - size * 1.1;
      const x1 = Math.max(...pts.map((p) => p.x)) + size * 1.1;
      const rowFresh = idx.reduce((s, { i }) => s + clamp(fresh[i] ?? 0, 0, 1), 0) / idx.length;
      ctx.fillStyle = withAlpha(PLANK_LIT, dim * 0.7 + 0.45 * rowFresh);
      ctx.fillRect(x0, ys2, x1 - x0, Math.max(1, size * 0.16));
    }

    for (let i = 0; i < fresh.length; i++) {
      const p = pt(i);
      const f = fresh[i];
      const slot = r.treats[i];
      if (f <= 0.02) {
        ctx.globalAlpha = dim + 0.45;
        drawTreatGhost(ctx, p.x, p.y, size, slot?.shape ?? "cookie");
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.4);
      halo.addColorStop(0, withAlpha(r.color, lerp(0.12, 0.34, f)));
      halo.addColorStop(1, withAlpha(r.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawTreat(ctx, p.x, p.y, size, slot?.shape ?? "cookie", {
        color: r.color,
        freshness: f,
        special: mastery.isSpecial(r.facts[i].id),
        stale: mastery.isStale(r.facts[i].id, now),
        time: time + i * 1.9,
      });
    }
    ctx.restore();
  }
}

/** Smallest horizontal gap between plated treats, used to infer the column count. */
function minGap(treats: { x: number }[]): number {
  return minGapSlots(treats);
}

function minGapSlots(treats: { x: number }[]): number {
  const xs = [...new Set(treats.map((t) => Math.round(t.x * 1000) / 1000))].sort((a, b) => a - b);
  if (xs.length < 2) return 1;
  let g = 1;
  for (let i = 1; i < xs.length; i++) g = Math.min(g, xs[i] - xs[i - 1]);
  return Math.max(0.05, g);
}
