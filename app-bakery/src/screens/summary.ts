import { audio } from "../core/audio";
import { el, stagger } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import { factText, CHAPTERS, type Chapter, type Recipe, type Fact, type FactFrame } from "../game/curriculum";
import { store } from "../game/store";
import { enterChapter, nextChapterIndex } from "../game/progress";
import { decorEarnedBetween, nextDecor } from "../game/decor";
import { makeMapScreen } from "./map";

interface SummaryArgs {
  recipe: Recipe;
  attempts: { fact: Fact; frame: FactFrame; correct: boolean; ms: number }[];
  bestStreak: number;
  /** The shelf is full right now. */
  completed: boolean;
  /** The shelf was filled for the *first* time by this lesson. */
  firstCompletion: boolean;
  /** This lesson finished the chapter, and the child has somewhere new to go. */
  chapterFinished: Chapter | null;
  /** Every chapter is done. */
  gameFinished: boolean;
  /** Sprinkle total when the lesson began, so the summary can name what was bought with it. */
  sprinklesAtStart: number;
}

/**
 * End-of-lesson summary — the tray coming out of the oven.
 *
 * Three rules, the first two learned from the competitor complaint set:
 *  1. Never show a score the child can "fail". The summary reports what was *baked*, not a grade.
 *  2. Never place a purchase prompt here. Interrupting the moment a child finishes something is the
 *     single most-complained-about pattern in this category.
 *  3. Celebrate a thing once. Re-baking a finished shelf used to fire the same confetti and the
 *     same "this tray stays in the case forever" as finishing it for the first time, every single
 *     time. A child works out very quickly that a reward which arrives whatever they do is not a
 *     reward, and the real achievement is devalued along with it.
 */
export function makeSummaryScreen(args: SummaryArgs): (world: World) => ScreenInstance {
  return (world: World): ScreenInstance => {
    const { recipe, attempts, bestStreak, completed, firstCompletion, chapterFinished, gameFinished, sprinklesAtStart } =
      args;
    const correct = attempts.filter((a) => a.correct).length;
    const progress = store.mastery.progress(recipe);
    const fastest = attempts.filter((a) => a.correct).sort((a, b) => a.ms - b.ms)[0];
    const restocked = completed && !firstCompletion;

    const headline = gameFinished
      ? "The whole bakery is full."
      : chapterFinished
        ? `${chapterFinished.title} is full!`
        : firstCompletion
          ? `${recipe.name} — all baked!`
          : restocked
            ? `${recipe.name} — fresh again`
            : `${progress.baked} of ${progress.total} treats baked`;
    const sub = gameFinished
      ? "Every recipe, every shelf, every treat. Crumb could not have done it without you."
      : chapterFinished
        ? "Every shelf in this room is full. Crumb has found another door."
        : firstCompletion
          ? `You found every way to make ${recipe.number}. This tray stays in the case forever.`
          : restocked
            ? "Everything on this shelf is warm again. Nothing here goes to waste."
            : `Keep going — there are more ways to make ${recipe.number}.`;
    const eyebrow = gameFinished
      ? "The end"
      : chapterFinished
        ? "Chapter finished"
        : firstCompletion
          ? "Recipe finished"
          : restocked
            ? "Restocked"
            : "Good baking";

    const stats = el(
      "div",
      { class: "summary__stats" },
      stat("Treats baked", String(correct)),
      stat("Best streak", String(bestStreak)),
      fastest ? stat("Fastest", `${(fastest.ms / 1000).toFixed(1)}s`) : null
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
          f ? factText(f, true) : id
        );
      })
    );

    // ---------------------------------------------------------------- the sprinkle jar
    // What the sprinkles were actually for. Either Crumb bought something with them during this
    // lesson, or the jar shows exactly how far off the next thing is, by name.
    const sprinkles = store.state.sprinkles;
    const bought = decorEarnedBetween(sprinklesAtStart, sprinkles);
    const saving = nextDecor(sprinkles);
    const jar = bought.length > 0
      ? el(
          "div",
          { class: "summary__jar", dataset: { state: "bought" } },
          el("p", { class: "summary__jarTitle", textContent: `Crumb spent ${sprinkles - sprinklesAtStart} sprinkles!` }),
          ...bought.map((d) =>
            el("p", { class: "summary__jarLine", textContent: `${d.name} — ${d.line}` })
          )
        )
      : saving
        ? el(
            "div",
            { class: "summary__jar", dataset: { state: "saving" } },
            el("p", {
              class: "summary__jarTitle",
              textContent: `${saving.remaining} more sprinkles until the ${saving.decor.name.toLowerCase()}`,
            }),
            el(
              "div",
              { class: "summary__jarTrack", aria: { hidden: "true" } },
              el("div", {
                class: "summary__jarFill",
                style: { width: `${Math.round(saving.fill * 100)}%` },
              })
            )
          )
        : el(
            "div",
            { class: "summary__jar", dataset: { state: "done" } },
            el("p", {
              class: "summary__jarTitle",
              textContent: "The bakery has everything it needs. Crumb is keeping the rest.",
            })
          );

    const nextChapter =
      chapterFinished && !gameFinished
        ? nextChapterIndex(chapterFinished.index + 1, store.mastery)
        : null;
    const nextTitle = nextChapter === null ? null : (CHAPTERS[nextChapter]?.title ?? null);

    const root = el(
      "div",
      { class: "summary center" },
      el(
        "div",
        { class: "summary__panel panel" },
        el("p", { class: "summary__eyebrow prompt", textContent: eyebrow }),
        el("h1", { class: "headline", textContent: headline }),
        el("p", { class: "summary__sub dim", textContent: sub }),
        stagger(stats),
        jar,
        recap,
        el(
          "div",
          { class: "summary__actions row" },
          el("button", {
            class: "btn btn--primary btn--large",
            textContent: gameFinished
              ? "Back to the bakery"
              : nextTitle
                ? `Open ${nextTitle}`
                : "Keep going",
            type: "button",
            on: {
              click: () => {
                audio.select();
                // Finishing a chapter is the one place the story moves the child somewhere new.
                // Doing it here, on the button they are already reaching for, means progression
                // never needs explaining.
                if (nextChapter !== null) enterChapter(nextChapter);
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
        world.crumb.setMood(firstCompletion ? "proud" : "encouraging");
        world.shelf.setRecipe(recipe, store.mastery);

        if (firstCompletion) {
          // One big burst, once — and only the first time this shelf was filled.
          const w = world.stage.width;
          const big = gameFinished || chapterFinished !== null;
          world.particles.burst(w / 2, world.stage.height * 0.3, {
            count: big ? 90 : 46,
            color: world.scenery.current.accent,
            speed: big ? 520 : 420,
          });
          world.particles.ring(w / 2, world.stage.height * 0.3, "#FFFFFF", big ? 300 : 220);
        } else if (bought.length > 0) {
          // Something was actually bought. Smaller than finishing a shelf, but it has to land.
          audio.fanfare();
          world.particles.burst(world.stage.width / 2, world.stage.height * 0.36, {
            count: 28,
            color: "#FFD9A0",
            speed: 300,
          });
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
