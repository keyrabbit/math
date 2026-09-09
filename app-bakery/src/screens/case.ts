import { audio } from "../core/audio";
import { el, setChildren } from "../core/dom";
import { ShelfView } from "../render/shelf";
import { withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { CHAPTERS, chapterRecipes, opSymbol, type Recipe } from "../game/curriculum";
import { store } from "../game/store";
import { makeMapScreen } from "./map";

/**
 * The Bakery Case.
 *
 * This is the game's collection screen and, quietly, its retention mechanic. Everything the child
 * has mastered is displayed as a permanent, personal shop window. Unlike a points total or a streak
 * counter, it cannot go down, it looks better the more work is behind it, and it is the one screen
 * a child will show a parent unprompted.
 */
export function makeCaseScreen(world: World): ScreenInstance {
  const mastery = store.mastery;
  const groups = CHAPTERS.map((chapter) => ({
    chapter,
    recipes: chapterRecipes(chapter),
  }));

  const everyRecipe = groups.flatMap((g) => g.recipes);
  const bakedTotal = everyRecipe.reduce((n, r) => n + mastery.progress(r).baked, 0);
  const treatTotal = everyRecipe.reduce((n, r) => n + r.facts.length, 0);
  const completeTotal = everyRecipe.filter((r) => mastery.progress(r).complete).length;

  const detail = el("div", { class: "case__detail panel", dataset: { open: "0" } });

  function showDetail(r: Recipe): void {
    const p = mastery.progress(r);
    setChildren(detail, 
      el("h2", { class: "case__detailTitle", textContent: r.name }),
      el("p", {
        class: "prompt",
        textContent: `Ways to make ${r.number} · ${p.baked}/${p.total} baked`,
      }),
      el(
        "div",
        { class: "case__facts" },
        ...r.facts.map((f) =>
          el("span", {
            class: "case__fact",
            dataset: { lit: mastery.isBaked(f.id) ? "1" : "0" },
            textContent: `${f.a} ${opSymbol(f.op)} ${f.b} = ${f.answer}`,
          })
        )
      )
    );
    detail.dataset.open = "1";
  }

  const grid = el("div", { class: "case__grid" });
  const cells: { btn: HTMLButtonElement; recipe: Recipe }[] = [];

  for (const group of groups) {
    grid.appendChild(
      el(
        "h2",
        { class: "case__chapter" },
        group.chapter.title,
        el("span", {
          class: "case__chapterCount dim",
          textContent: ` ${group.recipes.filter((r) => mastery.progress(r).complete).length}/${
            group.recipes.length
          }`,
        })
      )
    );
    const row = el("div", { class: "case__row" });
    for (const r of group.recipes) {
      const p = mastery.progress(r);
      const btn = el("button", {
        class: "case__cell",
        type: "button",
        dataset: { state: p.complete ? "complete" : p.baked > 0 ? "partial" : "empty" },
        aria: { label: `${r.name}. ${p.baked} of ${p.total} treats baked.` },
        on: {
          click: () => {
            audio.tap();
            showDetail(r);
          },
        },
      });
      btn.appendChild(el("span", { class: "case__cellNumber", textContent: String(r.number) }));
      row.appendChild(btn);
      cells.push({ btn, recipe: r });
    }
    grid.appendChild(row);
  }

  const root = el(
    "div",
    { class: "case" },
    el(
      "header",
      { class: "hud" },
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        textContent: "Back",
        on: {
          click: () => {
            audio.back();
            void world.go(makeMapScreen);
          },
        },
      }),
      el("div", { class: "hud__spacer" }),
      el(
        "div",
        { class: "hud__chip" },
        el("span", { class: "dot" }),
        el("span", { textContent: `${bakedTotal}/${treatTotal} treats` })
      )
    ),
    el(
      "div",
      { class: "case__intro" },
      el("h1", { class: "headline", textContent: "Your case" }),
      el("p", {
        class: "dim",
        textContent:
          completeTotal === 0
            ? "Every number fact you learn bakes a treat. Nothing here is ever taken away."
            : `${completeTotal} recipe${completeTotal === 1 ? "" : "s"} finished. Nothing here is ever taken away.`,
      })
    ),
    el("div", { class: "case__scroll grow" }, grid),
    detail
  );

  let removeLayer: (() => void) | null = null;

  return {
    element: root,
    mounted() {
      // The case is about the treats, not the baker — hiding Crumb keeps the focus.
      world.showCrumb = false;
      world.setRoom("pantry");

      // Each cell's shelf is drawn on the shared canvas, positioned from the DOM rects. One canvas
      // layer for dozens of thumbnails costs far less than dozens of canvases.
      removeLayer = world.stage.add((c) => {
        // Scrim over the scenery. Without it the parallax shelves read straight through the grid
        // and the cells look like holes punched in a room rather than windows onto a display case.
        const scroll = root.querySelector<HTMLElement>(".case__scroll");
        if (scroll) {
          const r = scroll.getBoundingClientRect();
          const g = c.ctx.createLinearGradient(0, r.top, 0, r.bottom);
          g.addColorStop(0, withAlpha("#180E07", 0.55));
          g.addColorStop(0.12, withAlpha("#180E07", 0.8));
          g.addColorStop(1, withAlpha("#180E07", 0.8));
          c.ctx.fillStyle = g;
          c.ctx.fillRect(0, r.top, c.width, r.height);
        }

        for (const cell of cells) {
          const r = cell.btn.getBoundingClientRect();
          if (r.bottom < -40 || r.top > c.height + 40) continue;
          const size = Math.min(r.width, r.height) * 0.86;
          ShelfView.drawStatic(
            c.ctx,
            cell.recipe,
            {
              x: r.left + (r.width - size) / 2,
              y: r.top + (r.height - size) / 2,
              w: size,
              h: size,
            },
            store.mastery,
            { time: c.elapsed + cell.recipe.number, dimUnbaked: 0.3 }
          );
        }
      }, 10);
    },
    destroy() {
      removeLayer?.();
      world.showCrumb = true;
    },
  };
}
