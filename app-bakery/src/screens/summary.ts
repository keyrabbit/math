import { audio } from "../core/audio";
import { el, stagger } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import { opSymbol, type Recipe, type Fact } from "../game/curriculum";
import { store } from "../game/store";
import { makeMapScreen } from "./map";

interface SummaryArgs {
  recipe: Recipe;
  attempts: { fact: Fact; correct: boolean; ms: number }[];
  bestStreak: number;
  completed: boolean;
}

/**
 * End-of-lesson summary — the tray coming out of the oven.
 *
 * Two rules, both learned from the competitor complaint set:
 *  1. Never show a score the child can "fail". The summary reports what was *baked*, not a grade.
 *  2. Never place a purchase prompt here. Interrupting the moment a child finishes something is the
 *     single most-complained-about pattern in this category.
 */
export function makeSummaryScreen(args: SummaryArgs): (world: World) => ScreenInstance {
  return (world: World): ScreenInstance => {
    const { recipe, attempts, bestStreak, completed } = args;
    const correct = attempts.filter((a) => a.correct).length;
    const progress = store.mastery.progress(recipe);
    const fastest = attempts.filter((a) => a.correct).sort((a, b) => a.ms - b.ms)[0];

    const headline = completed
      ? `${recipe.name} — all baked!`
      : `${progress.baked} of ${progress.total} treats baked`;
    const sub = completed
      ? `You found every way to make ${recipe.number}. This tray stays in the case forever.`
      : `Keep going — there are more ways to make ${recipe.number}.`;

    const stats = el(
      "div",
      { class: "summary__stats" },
      stat("Treats baked", String(correct)),
      stat("Best streak", String(bestStreak)),
      fastest ? stat("Fastest", `${(fastest.ms / 1000).toFixed(1)}s`) : null,
      stat("Sprinkles", String(store.state.sprinkles))
    );

    // One chip per distinct fact. A short lesson revisits facts on purpose (that is the whole
    // point of the schedule), but listing "1 + 4 = 5" three times reads as a rendering bug rather
    // than as practice. A fact counts as shaky if it was ever missed.
    const seen = new Map<string, boolean>();
    for (const a of attempts) {
      seen.set(a.fact.id, (seen.get(a.fact.id) ?? true) && a.correct);
    }
    const recap = el(
      "div",
      { class: "summary__recap" },
      ...[...seen.entries()].slice(0, 10).map(([id, ok]) => {
        const f = recipe.facts.find((x) => x.id === id);
        return el(
          "span",
          { class: "summary__fact", dataset: { ok: ok ? "1" : "0" } },
          f ? `${f.a} ${opSymbol(f.op)} ${f.b} = ${f.answer}` : id
        );
      })
    );

    const root = el(
      "div",
      { class: "summary center" },
      el(
        "div",
        { class: "summary__panel panel" },
        el("p", {
          class: "summary__eyebrow prompt",
          textContent: completed ? "Recipe finished" : "Good baking",
        }),
        el("h1", { class: "headline", textContent: headline }),
        el("p", { class: "summary__sub dim", textContent: sub }),
        stagger(stats),
        recap,
        el(
          "div",
          { class: "summary__actions row" },
          el("button", {
            class: "btn btn--primary btn--large",
            textContent: "Keep going",
            type: "button",
            on: {
              click: () => {
                audio.select();
                void world.go(makeMapScreen);
              },
            },
          })
        )
      )
    );

    let removeTick: (() => void) | null = null;
    let removeLayer: (() => void) | null = null;

    return {
      element: root,
      mounted() {
        world.showCrumb = true;
        world.crumb.setMood(completed ? "proud" : "encouraging");
        world.shelf.setRecipe(recipe, store.mastery);

        if (completed) {
          // One big burst, once. Repeated confetti stops meaning anything.
          const w = world.stage.width;
          world.particles.burst(w / 2, world.stage.height * 0.3, {
            count: 46,
            color: world.scenery.current.accent,
            speed: 420,
          });
          world.particles.ring(w / 2, world.stage.height * 0.3, "#FFFFFF", 220);
        }

        // The finished tray floats above the panel as the proof of what was earned.
        removeLayer = world.stage.add((c) => {
          const size = Math.min(c.width * 0.56, c.height * 0.3);
          world.shelf.update(c.dt);
          world.shelf.draw(c.ctx, {
            x: (c.width - size) / 2,
            y: c.height * 0.19 - size / 2,
            w: size,
            h: size,
          });
        }, 10);

        removeTick = ticker.add(() => {
          // Peeking over the bottom edge — face and toque visible, body cropped — so the panel
          // above stays the subject. Anchoring at the body centre is what keeps the eyes on screen;
          // pushing it past the edge by its full extent left only the hat tip showing.
          world.crumb.setScale(0.8);
          world.crumb.moveTo(world.stage.width * 0.5, world.stage.height - 8);
        });
      },
      destroy() {
        removeTick?.();
        removeLayer?.();
      },
    };
  };
}

function stat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "summary__stat" },
    el("span", { class: "summary__statValue", textContent: value }),
    el("span", { class: "summary__statLabel", textContent: label })
  );
}
