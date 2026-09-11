import { audio } from "../core/audio";
import { el, stagger } from "../core/dom";
import { ticker } from "../core/ticker";
import { ShelfView } from "../render/shelf";
import { glow, withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { CHAPTERS, chapterRecipes, type Recipe } from "../game/curriculum";
import { store } from "../game/store";
import { chapterIsComplete, unlockedChapters, enterChapter, leastRecent } from "../game/progress";
import { makeLessonScreen } from "./lesson";
import { makeCaseScreen } from "./case";
import { makeParentsScreen } from "./parents";

/**
 * The day's order board.
 *
 * Rather than a grid of levels, a chapter's recipes are laid out as a **list of orders pinned up
 * the wall**. The recipe the child should bake next glows; every node shows its own shelf in
 * miniature, filled exactly as far as the child has taken it.
 *
 * The board is *vertical and scrolling*. A horizontal arc looks elegant with five nodes and becomes
 * an unreadable pile of overlapping circles at the ten nodes Chapter 2 actually contains. Vertical
 * scrolling is also the gesture this audience already knows from every other app on the device, and
 * it matches the reference app's own vertical "Books" list — the one structural idea it gets right.
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
  const recipes = chapterRecipes(chapter);
  const mastery = store.mastery;

  const found = recipes.findIndex((r) => !mastery.progress(r).complete);
  // When every shelf in the room is full there is no "next" — the board switches to keeping the
  // bakery fresh, and the recipe left alone the longest is the one worth opening.
  const chapterDone = found < 0;
  const maintenance = chapterDone ? leastRecent(recipes, mastery) : null;
  const nextIndex = chapterDone
    ? Math.max(0, recipes.findIndex((r) => r === maintenance))
    : found;

  /**
   * The first finished recipe with treats going stale, if any.
   *
   * Without this the whole spaced-repetition model is unreachable: `nextFact` prioritises stale
   * facts *within* a recipe, but once a recipe is finished the board moves on and the child never
   * comes back, so those treats sit going stale on a shelf nobody visits. Surfacing the oldest
   * stale recipe here — and offering it as the primary action — is what turns the decay from a
   * decoration into an actual review schedule.
   */
  const restockIndex = recipes.findIndex((r) => {
    const p = mastery.progress(r);
    return p.complete && !p.allSpecial && p.due > 0;
  });

  const pathHeight = TOP_PAD + (recipes.length - 1) * NODE_SPACING + BOTTOM_PAD;

  const trail = el("canvas", { class: "map__trail", aria: { hidden: "true" } });
  const path = el("div", { class: "map__path" });
  path.style.height = `${pathHeight}px`;
  const scroller = el("div", { class: "map__scroll" }, path);

  /** Node centre within the path element's own coordinate space. */
  const nodePos = (i: number, width: number): { x: number; y: number } => ({
    x: width / 2 + Math.sin(i * 1.05 + 0.4) * width * SWING,
    y: TOP_PAD + i * NODE_SPACING,
  });

  const nodeButtons: HTMLButtonElement[] = recipes.map((r, i) => {
    const p = mastery.progress(r);
    const isNext = i === nextIndex;
    const state = p.allSpecial
      ? "sealed"
      : p.complete && p.due > 0
        ? "fading"
        : p.complete
          ? "complete"
          : isNext
            ? "next"
            : "open";
    const btn = el("button", {
      class: "mapnode",
      type: "button",
      dataset: { state },
      aria: {
        label: `${r.name}. ${r.subtitle}. ${p.baked} of ${p.total} treats baked.${
          p.due > 0 ? ` ${p.due} going stale — worth baking again.` : ""
        }${isNext ? " Bake next." : ""}`,
      },
      on: {
        click: () => {
          audio.select();
          void world.go(makeLessonScreen(r));
        },
      },
    });
    btn.append(
      el(
        "span",
        { class: "mapnode__disc" },
        el("span", { class: "mapnode__number", textContent: String(r.number) })
      ),
      el(
        "span",
        { class: "mapnode__meta" },
        el("span", { class: "mapnode__name", textContent: r.name }),
        el("span", {
          class: "mapnode__progress",
          textContent:
            p.due > 0 ? `${p.baked}/${p.total} · ${p.due} stale` : `${p.baked}/${p.total}`,
        })
      )
    );
    path.appendChild(btn);
    return btn;
  });

  path.appendChild(trail);

  // A due restock outranks new material. This is the one place the game is allowed to steer, and it
  // steers toward the thing that actually builds fluency. The wording is an invitation to go and
  // look after something, never a chore or a warning.
  const restockTarget = restockIndex >= 0 ? recipes[restockIndex] : null;
  const playTarget = restockTarget ?? recipes[nextIndex] ?? recipes[0];

  const buttons = el("div", { class: "map__actions row" });
  buttons.append(
    el("button", {
      class: "btn btn--primary btn--large",
      type: "button",
      textContent: restockTarget
        ? `Restock ${restockTarget.name}`
        : chapterDone && playTarget
          ? `Keep ${playTarget.name} fresh`
          : playTarget
            ? `Bake ${playTarget.name}`
            : "Bake",
      on: {
        click: () => {
          audio.select();
          void world.go(makeLessonScreen(playTarget));
        },
      },
    }),
    el("button", {
      class: "btn btn--ghost",
      type: "button",
      textContent: "Bakery Case",
      on: {
        click: () => {
          audio.select();
          void world.go(makeCaseScreen);
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
    })
  );

  const totalBaked = recipes.reduce((n, r) => n + mastery.progress(r).baked, 0);
  const totalTreats = recipes.reduce((n, r) => n + r.facts.length, 0);

  /**
   * The doors to the rooms already opened.
   *
   * Shown only once there is more than one, so a child's first hour is never cluttered with a
   * navigation control that does nothing. Once the bakery has several rooms this is the only way
   * back into an earlier one to restock it, and a chapter the child has finished is exactly where
   * their oldest, stalest treats live.
   */
  const rooms = unlockedChapters();
  const doors =
    rooms.length > 1
      ? el(
          "div",
          { class: "map__rooms", aria: { role: "tablist", label: "Rooms" } },
          ...rooms.map((c) => {
            const done = chapterIsComplete(c, mastery);
            const here = c.index === chapterIndex;
            return el("button", {
              class: "map__room",
              type: "button",
              dataset: { state: here ? "here" : done ? "done" : "open" },
              textContent: c.title.replace(/^The /, ""),
              aria: {
                role: "tab",
                selected: here ? "true" : "false",
                label: `${c.title}${done ? ", every shelf full" : ""}`,
              },
              on: {
                click: () => {
                  if (here) return;
                  audio.select();
                  enterChapter(c.index);
                  void world.go(makeMapScreen);
                },
              },
            });
          })
        )
      : null;

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
        el("p", {
          class: "map__subtitle dim",
          textContent: chapterDone
            ? `${chapter.subtitle} · every shelf full — now Crumb keeps them fresh`
            : chapter.subtitle,
        })
      ),
      el(
        "div",
        {
          class: "hud__chip map__chip",
          aria: { label: `${totalBaked} of ${totalTreats} treats baked` },
        },
        el("span", { class: "dot" }),
        el("span", { textContent: `${totalBaked}/${totalTreats}` })
      )
    ),
    doors,
    scroller,
    stagger(buttons)
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

    // The trail: solid behind you, dotted ahead. A dotted line reads as "not baked yet" without
    // needing a lock icon, which is the visual language of being forbidden rather than of being
    // simply further down the list.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    for (let i = 1; i < recipes.length; i++) {
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

    recipes.forEach((r, i) => {
      const p = nodePos(i, width);
      const size = 108;
      if (i === nextIndex) {
        const pulse = 0.5 + Math.sin(elapsed * 2) * 0.5;
        glow(ctx, p.x, p.y, 62 + pulse * 20, accent, 0.26 + pulse * 0.14);
      }
      ShelfView.drawStatic(
        ctx,
        r,
        { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size },
        mastery,
        { time: elapsed + i, dimUnbaked: 0.26, fit: "circle" }
      );
    });
  }

  return {
    element: root,
    mounted() {
      // The world Crumb is hidden here: it cannot scroll with the board, and a character pinned to
      // the viewport while the list moves underneath it looks broken.
      world.showCrumb = false;
      world.setRoom(chapter.room);
      layout();
      window.addEventListener("resize", layout);

      // Bring the next node into view without yanking — the child should see the board move.
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
      world.showCrumb = true;
    },
  };
}

export type { Recipe };
