import { audio } from "../core/audio";
import { el } from "../core/dom";
import { ConstellationView } from "../render/constellation";
import { withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { CHAPTERS, chapterConstellations, opSymbol, type Constellation } from "../game/curriculum";
import { store } from "../game/store";
import { makeMapScreen } from "./map";

/**
 * The Star Atlas.
 *
 * This is the game's collection screen and, quietly, its retention mechanic. Everything the child
 * has mastered is drawn as a permanent, personal night sky. Unlike a points total or a streak
 * counter, it cannot go down, it looks better the more work is behind it, and it is the one screen
 * a child will show a parent unprompted.
 */
export function makeAtlasScreen(world: World): ScreenInstance {
  const mastery = store.mastery;
  const groups = CHAPTERS.map((chapter) => ({
    chapter,
    constellations: chapterConstellations(chapter),
  }));

  const allConstellations = groups.flatMap((g) => g.constellations);
  const litTotal = allConstellations.reduce((n, c) => n + mastery.progress(c).lit, 0);
  const starTotal = allConstellations.reduce((n, c) => n + c.facts.length, 0);
  const completeTotal = allConstellations.filter((c) => mastery.progress(c).complete).length;

  const detail = el("div", { class: "atlas__detail panel", dataset: { open: "0" } });

  function showDetail(c: Constellation): void {
    const p = mastery.progress(c);
    detail.replaceChildren(
      el("h2", { class: "atlas__detailTitle", textContent: c.name }),
      el("p", { class: "prompt", textContent: `Ways to make ${c.number} · ${p.lit}/${p.total} stars` }),
      el(
        "div",
        { class: "atlas__facts" },
        ...c.facts.map((f) =>
          el("span", {
            class: "atlas__fact",
            dataset: { lit: mastery.isLit(f.id) ? "1" : "0" },
            textContent: `${f.a} ${opSymbol(f.op)} ${f.b} = ${f.answer}`,
          })
        )
      )
    );
    detail.dataset.open = "1";
  }

  const grid = el("div", { class: "atlas__grid" });
  const cells: { btn: HTMLButtonElement; constellation: Constellation }[] = [];

  for (const group of groups) {
    grid.appendChild(
      el(
        "h2",
        { class: "atlas__chapter" },
        group.chapter.title,
        el("span", {
          class: "atlas__chapterCount dim",
          textContent: ` ${group.constellations.filter((c) => mastery.progress(c).complete).length}/${group.constellations.length}`,
        })
      )
    );
    const row = el("div", { class: "atlas__row" });
    for (const c of group.constellations) {
      const p = mastery.progress(c);
      const btn = el("button", {
        class: "atlas__cell",
        type: "button",
        dataset: { state: p.complete ? "complete" : p.lit > 0 ? "partial" : "empty" },
        aria: { label: `${c.name}. ${p.lit} of ${p.total} stars lit.` },
        on: {
          click: () => {
            audio.tap();
            showDetail(c);
          },
        },
      });
      btn.appendChild(el("span", { class: "atlas__cellNumber", textContent: String(c.number) }));
      row.appendChild(btn);
      cells.push({ btn, constellation: c });
    }
    grid.appendChild(row);
  }

  const root = el(
    "div",
    { class: "atlas" },
    el(
      "header",
      { class: "hud" },
      el(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          textContent: "Back",
          on: {
            click: () => {
              audio.back();
              void world.go(makeMapScreen);
            },
          },
        }
      ),
      el("div", { class: "hud__spacer" }),
      el(
        "div",
        { class: "hud__chip" },
        el("span", { class: "dot" }),
        el("span", { textContent: `${litTotal}/${starTotal} stars` })
      )
    ),
    el(
      "div",
      { class: "atlas__intro" },
      el("h1", { class: "headline", textContent: "Your sky" }),
      el("p", {
        class: "dim",
        textContent:
          completeTotal === 0
            ? "Every number fact you master lights a star. Nothing here ever goes out."
            : `${completeTotal} constellation${completeTotal === 1 ? "" : "s"} complete. Nothing here ever goes out.`,
      })
    ),
    el("div", { class: "atlas__scroll grow" }, grid),
    detail
  );

  let removeLayer: (() => void) | null = null;

  return {
    element: root,
    mounted() {
      // The Atlas is about the sky, not the character — hiding the Pipkin keeps the focus.
      world.showPipkin = false;
      world.setBiome("observatory");

      // Each grid cell's constellation is drawn on the shared canvas, positioned from the DOM
      // rects. One canvas layer for dozens of thumbnails costs far less than dozens of canvases.
      removeLayer = world.stage.add((c) => {
        // Scrim over the scenery. Without it the parallax hills read straight through the grid and
        // the cells look like holes punched in a landscape rather than windows onto a night sky.
        const scroll = root.querySelector<HTMLElement>(".atlas__scroll");
        if (scroll) {
          const r = scroll.getBoundingClientRect();
          const g = c.ctx.createLinearGradient(0, r.top, 0, r.bottom);
          g.addColorStop(0, withAlpha("#080614", 0.55));
          g.addColorStop(0.12, withAlpha("#080614", 0.78));
          g.addColorStop(1, withAlpha("#080614", 0.78));
          c.ctx.fillStyle = g;
          c.ctx.fillRect(0, r.top, c.width, r.height);
        }

        for (const cell of cells) {
          const r = cell.btn.getBoundingClientRect();
          if (r.bottom < -40 || r.top > c.height + 40) continue;
          const size = Math.min(r.width, r.height) * 0.86;
          ConstellationView.drawStatic(
            c.ctx,
            cell.constellation,
            {
              x: r.left + (r.width - size) / 2,
              y: r.top + (r.height - size) / 2,
              w: size,
              h: size,
            },
            store.mastery,
            { time: c.elapsed + cell.constellation.number, dimUnlit: 0.3 },
          );
        }
      }, 10);
    },
    destroy() {
      removeLayer?.();
      world.showPipkin = true;
    },
  };
}

