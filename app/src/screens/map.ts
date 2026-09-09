import { audio } from "../core/audio";
import { el, stagger } from "../core/dom";
import { ticker } from "../core/ticker";
import { ConstellationView } from "../render/constellation";
import { glow, withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { CHAPTERS, chapterConstellations, type Constellation } from "../game/curriculum";
import { store } from "../game/store";
import { makeLessonScreen } from "./lesson";
import { makeAtlasScreen } from "./atlas";
import { makeParentsScreen } from "./parents";

/**
 * The journey hub.
 *
 * Rather than a grid of levels, a chapter's constellations are laid out as a **trail winding up
 * through the sky**. The node the child should play next glows; every node shows its own
 * constellation in miniature, lit exactly as far as the child has taken it.
 *
 * The trail is *vertical and scrolling*. The first version drew a horizontal arc, which looked
 * elegant with five nodes and became an unreadable pile of overlapping circles at the ten nodes
 * Chapter 2 actually contains. Vertical scrolling is also the gesture this audience already knows
 * from every other app on the device, and it matches the reference app's own vertical "Books"
 * list — the one structural idea it gets right.
 *
 * The trail and the miniatures are drawn on a canvas *inside* the scroll container rather than on
 * the shared world stage, so they scroll with the nodes for free instead of needing a synchronised
 * scroll offset.
 */

/** Vertical distance between nodes, px. Generous: these are 5-year-old-sized tap targets. */
const NODE_SPACING = 152;
/** How far nodes swing either side of centre. */
const SWING = 0.19;
const TOP_PAD = 84;
const BOTTOM_PAD = 130;

export function makeMapScreen(world: World): ScreenInstance {
  const chapterIndex = Math.min(store.state.chapter, CHAPTERS.length - 1);
  const chapter = CHAPTERS[chapterIndex];
  const constellations = chapterConstellations(chapter);
  const mastery = store.mastery;

  const found = constellations.findIndex((c) => !mastery.progress(c).complete);
  const nextIndex = found < 0 ? constellations.length - 1 : found;

  const pathHeight = TOP_PAD + (constellations.length - 1) * NODE_SPACING + BOTTOM_PAD;

  const trail = el("canvas", { class: "map__trail", aria: { hidden: "true" } });
  const path = el("div", { class: "map__path" });
  path.style.height = `${pathHeight}px`;
  const scroller = el("div", { class: "map__scroll" }, path);

  /** Node centre within the path element's own coordinate space. */
  const nodePos = (i: number, width: number): { x: number; y: number } => ({
    x: width / 2 + Math.sin(i * 1.05 + 0.4) * width * SWING,
    y: TOP_PAD + i * NODE_SPACING,
  });

  const nodeButtons: HTMLButtonElement[] = constellations.map((c, i) => {
    const p = mastery.progress(c);
    const isNext = i === nextIndex;
    const state = p.isSealed ? "sealed" : p.complete ? "complete" : isNext ? "next" : "open";
    const btn = el("button", {
      class: "mapnode",
      type: "button",
      dataset: { state },
      aria: {
        label: `${c.name}. ${c.subtitle}. ${p.lit} of ${p.total} stars lit.${
          p.fading > 0 ? ` ${p.fading} fading.` : ""
        }${isNext ? " Play next." : ""}`,
      },
      on: {
        click: () => {
          audio.select();
          void world.go(makeLessonScreen(c));
        },
      },
    });
    btn.append(
      el(
        "span",
        { class: "mapnode__disc" },
        el("span", { class: "mapnode__number", textContent: String(c.number) }),
      ),
      el(
        "span",
        { class: "mapnode__meta" },
        el("span", { class: "mapnode__name", textContent: c.name }),
        el("span", {
          class: "mapnode__progress",
          textContent: p.fading > 0 ? `${p.lit}/${p.total} · ${p.fading} fading` : `${p.lit}/${p.total}`,
        }),
      ),
    );
    path.appendChild(btn);
    return btn;
  });

  path.appendChild(trail);

  const buttons = el("div", { class: "map__actions row" });
  buttons.append(
    el("button", {
      class: "btn btn--primary btn--large",
      type: "button",
      textContent: constellations[nextIndex] ? `Play ${constellations[nextIndex].name}` : "Play",
      on: {
        click: () => {
          audio.select();
          void world.go(makeLessonScreen(constellations[nextIndex] ?? constellations[0]));
        },
      },
    }),
    el("button", {
      class: "btn btn--ghost",
      type: "button",
      textContent: "Star Atlas",
      on: {
        click: () => {
          audio.select();
          void world.go(makeAtlasScreen);
        },
      },
    }),
    el("button", {
      class: "btn btn--ghost",
      type: "button",
      textContent: "For grown-ups",
      on: {
        click: () => {
          audio.select();
          void world.go(makeParentsScreen);
        },
      },
    }),
  );

  const totalLit = constellations.reduce((n, c) => n + mastery.progress(c).lit, 0);
  const totalStars = constellations.reduce((n, c) => n + c.facts.length, 0);

  const root = el(
    "div",
    { class: "map" },
    el(
      "header",
      { class: "map__header" },
      el(
        "div",
        { class: "map__titles" },
        el("p", { class: "prompt", textContent: `Chapter ${chapterIndex + 1}` }),
        el("h1", { class: "headline", textContent: chapter.title }),
        el("p", { class: "map__subtitle dim", textContent: chapter.subtitle }),
      ),
      el(
        "div",
        { class: "hud__chip map__chip", aria: { label: `${totalLit} of ${totalStars} stars lit` } },
        el("span", { class: "dot" }),
        el("span", { textContent: `${totalLit}/${totalStars}` }),
      ),
    ),
    scroller,
    stagger(buttons),
  );

  let removeTick: (() => void) | null = null;
  let width = 0;

  function layout(): void {
    width = path.clientWidth;
    if (width === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    trail.width = Math.round(width * dpr);
    trail.height = Math.round(pathHeight * dpr);
    trail.style.width = `${width}px`;
    trail.style.height = `${pathHeight}px`;
    nodeButtons.forEach((btn, i) => {
      const p = nodePos(i, width);
      btn.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
    });
  }

  function drawTrail(elapsed: number): void {
    if (width === 0) return;
    const ctx = trail.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, pathHeight);
    const accent = world.scenery.current.accent;

    // The trail: solid behind you, dotted ahead. A dotted line reads as "not yet walked" without
    // needing a lock icon, which is the visual language of being forbidden rather than of being
    // ahead of you.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    for (let i = 1; i < constellations.length; i++) {
      const a = nodePos(i - 1, width);
      const b = nodePos(i, width);
      const walked = i <= nextIndex;
      ctx.setLineDash(walked ? [] : [3, 13]);
      ctx.strokeStyle = withAlpha(walked ? accent : "#FFFFFF", walked ? 0.42 : 0.17);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      // Bow the segment away from centre so the trail meanders instead of zig-zagging.
      const mx = (a.x + b.x) / 2 + (a.x - width / 2) * 0.35;
      const my = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    constellations.forEach((con, i) => {
      const p = nodePos(i, width);
      const size = 108;
      if (i === nextIndex) {
        const pulse = 0.5 + Math.sin(elapsed * 2) * 0.5;
        glow(ctx, p.x, p.y, 62 + pulse * 20, accent, 0.26 + pulse * 0.14);
      }
      ConstellationView.drawStatic(
        ctx,
        con,
        { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size },
        mastery,
        { time: elapsed + i, dimUnlit: 0.26 },
      );
    });
  }

  return {
    element: root,
    mounted() {
      // The world Pipkin is hidden here: it cannot scroll with the trail, and a character pinned to
      // the viewport while the path moves underneath it looks broken.
      world.showPipkin = false;
      world.setBiome(chapter.biome);
      layout();
      window.addEventListener("resize", layout);

      // Bring the next node into view without yanking — the child should see the trail move.
      requestAnimationFrame(() => {
        const target = Math.max(0, nodePos(nextIndex, width).y - scroller.clientHeight * 0.5);
        scroller.scrollTo({ top: target, behavior: world.reducedMotion ? "auto" : "smooth" });
      });

      removeTick = ticker.add((_dt, elapsed) => {
        if (path.clientWidth !== width) layout();
        drawTrail(elapsed);
      });
    },
    destroy() {
      window.removeEventListener("resize", layout);
      removeTick?.();
      world.showPipkin = true;
    },
  };
}

export type { Constellation };
