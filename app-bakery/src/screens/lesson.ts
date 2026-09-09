import { audio } from "../core/audio";
import { el, setChildren, stagger, wait } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import {
  CHAPTERS,
  chapterRecipes,
  factHint,
  opName,
  opSymbol,
  type Recipe,
  type Fact,
} from "../game/curriculum";
import { store } from "../game/store";
import { Hud } from "./hud";
import { makeMapScreen } from "./map";
import { makeSummaryScreen } from "./summary";

/** Facts answered per lesson. Short enough to finish in one sitting for a 5-year-old. */
const LESSON_LENGTH = 8;

interface Attempt {
  fact: Fact;
  correct: boolean;
  ms: number;
}

/**
 * The Recipe Card — the game's core loop.
 *
 * The reference app shows a vertical ladder of related facts and nothing else; the ladder is a
 * worksheet with a scroll animation. Here the same ladder is the **recipe card**, wired to a shelf
 * of treats: each solved fact bakes one specific treat and puts it on the shelf, so the child can
 * see both the local pattern (the steps of the recipe) and the goal (the full shelf) at once.
 *
 * Layout note: the shelf's canvas box is measured from the real `.lesson__shelf` element rather than
 * computed from viewport fractions. Guessing both independently makes them drift apart at some
 * sizes, with the character landing on top of the equation.
 */
export function makeLessonScreen(recipe: Recipe): (world: World) => ScreenInstance {
  return (world: World): ScreenInstance => {
    const chapter = CHAPTERS[store.state.chapter] ?? CHAPTERS[0];
    const mastery = store.mastery;

    let current: Fact | null = null;
    let entry = "";
    let questionStart = performance.now();
    let answered = 0;
    let streak = 0;
    let bestStreak = 0;
    let locked = false;
    const attempts: Attempt[] = [];
    /** Facts resolved this lesson, newest last — drives the "done" rows of the recipe card. */
    const solved: Fact[] = [];

    const hud = new Hud(world, {
      segments: LESSON_LENGTH,
      onBack: () => void world.go(makeMapScreen),
    });

    const ladder = el("div", { class: "ladder", aria: { role: "list", label: "Recipe steps" } });
    const slotEl = el("span", { class: "slot", dataset: { empty: "1" } });

    const promptEl = el("p", {
      class: "prompt lesson__prompt",
      textContent: "Find the missing number",
    });

    const skyEl = el("div", { class: "lesson__shelf" });

    const titleEl = el(
      "div",
      { class: "lesson__title" },
      el("span", { class: "lesson__recipe", textContent: recipe.name }),
      el("span", { class: "lesson__sub dim", textContent: recipe.subtitle })
    );

    // ---------------------------------------------------------------- keypad
    const keypad = el("div", { class: "keypad", aria: { role: "group", label: "Number keypad" } });
    for (const label of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"]) {
      const isBack = label === "⌫";
      const isGo = label === "✓";
      keypad.appendChild(
        el("button", {
          class: `key${isGo ? " key--go" : ""}${isBack ? " key--wide" : ""}`,
          textContent: label,
          type: "button",
          aria: { label: isBack ? "Delete" : isGo ? "Check answer" : label },
          on: {
            click: () => {
              if (isBack) onDelete();
              else if (isGo) void onSubmit();
              else onDigit(label);
            },
          },
        })
      );
    }

    const root = el(
      "div",
      { class: "lesson" },
      hud.element,
      skyEl,
      titleEl,
      el("div", { class: "lesson__body" }, promptEl, ladder),
      el("div", { class: "lesson__input" }, stagger(keypad))
    );

    // ---------------------------------------------------------------- recipe card

    function renderLadder(): void {
      setChildren(ladder);
      for (const f of solved.slice(-2)) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "done" }, aria: { role: "listitem" } },
            `${f.a} ${opSymbol(f.op)} ${f.b} = ${f.answer}`,
            el("span", { class: "ladder__tick", textContent: "✓" })
          )
        );
      }
      if (current) {
        ladder.appendChild(
          el(
            "div",
            {
              class: "ladder__row",
              dataset: { role: "active" },
              aria: {
                role: "listitem",
                label: `${current.a} ${opName(current.op)} ${current.b} equals what?`,
              },
            },
            `${current.a} ${opSymbol(current.op)} ${current.b} =`,
            slotEl
          )
        );
      }
      // Two greyed previews of what is coming, so the card reads as a continuing pattern.
      const upcoming = recipe.facts
        .filter((f) => f.id !== current?.id && !solved.some((s) => s.id === f.id))
        .slice(0, 2);
      for (const f of upcoming) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "upcoming" }, aria: { hidden: "true" } },
            `${f.a} ${opSymbol(f.op)} ${f.b} =`
          )
        );
      }
    }

    function updateSlot(): void {
      slotEl.textContent = entry || "";
      slotEl.dataset.empty = entry ? "0" : "1";
    }

    // ---------------------------------------------------------------- flow

    function factIndexOf(id: string | undefined): number {
      return id ? recipe.facts.findIndex((f) => f.id === id) : -1;
    }

    /**
     * A one-shot story beat, shown over the live shelf.
     *
     * The scrim is a bottom-weighted gradient rather than a flat wash so the shelf stays visible
     * behind it — the whole point of the beat is that the child looks at the stale treat while
     * Crumb talks about it. A flat modal would hide the very thing being explained.
     */
    function showBeat(lines: string[], cta: string): Promise<void> {
      return new Promise<void>((resolve) => {
        locked = true;
        world.crumb.setMood("curious");
        audio.select();

        const card = el(
          "div",
          { class: "beat__card" },
          ...lines.map((t, i) =>
            el("p", {
              class: i === 0 ? "beat__lead" : "beat__line",
              textContent: t,
            })
          ),
          el("button", {
            class: "btn btn--primary beat__btn",
            type: "button",
            textContent: cta,
            on: { click: () => close() },
          })
        );
        const overlay = el(
          "div",
          {
            class: "beat",
            aria: { role: "dialog", modal: "true", label: lines.join(" ") },
          },
          card
        );
        root.appendChild(overlay);
        // Focus the card, not the button. Programmatically focusing the button trips
        // `:focus-visible`, so a child who tapped their way here gets a keyboard focus ring they
        // never asked for. A container with tabindex="-1" is the standard dialog pattern: screen
        // readers announce it and keyboard users still tab straight to the only control.
        card.tabIndex = -1;
        requestAnimationFrame(() => card.focus({ preventScroll: true }));

        function close(): void {
          overlay.dataset.leaving = "1";
          audio.tap();
          world.crumb.setMood("delighted");
          setTimeout(() => {
            overlay.remove();
            locked = false;
            resolve();
          }, 260);
        }
      });
    }

    function nextQuestion(): void {
      current = mastery.nextFact(recipe, Date.now(), current?.id);
      entry = "";
      locked = false;
      questionStart = performance.now();
      renderLadder();
      updateSlot();
      world.shelf.setActiveFact(factIndexOf(current?.id));
      // A stale treat is a *review*, and saying so out loud is what teaches the child that the case
      // needs restocking. Without this the dulling just looks like a bug.
      const stale = !!current && mastery.isStale(current.id);
      promptEl.textContent = stale
        ? "This one's gone stale — bake it fresh"
        : "Find the missing number";
      world.crumb.setMood("curious");
      setTimeout(() => world.crumb.setMood("idle"), 900);

      // The very first time a treat goes stale, stop and explain it. A child who returns to find a
      // treat duller than they left it can read that as being punished for going away; this beat
      // reframes it as the case needing a restock, which is also literally what spaced repetition
      // is.
      if (stale && store.markSeen("firstStale")) {
        void showBeat(
          [
            "Look — that one's gone a bit stale.",
            "Treats go stale when nobody bakes them for a while. Bake it again and it will stay fresh for much longer next time.",
          ],
          "Bake it fresh"
        );
      }
    }

    function onDigit(d: string): void {
      if (locked || entry.length >= 3) return;
      entry += d;
      audio.key(entry.length - 1);
      updateSlot();
      // Auto-check once the entry can't usefully get any longer. Children of this age routinely
      // forget to press "check"; waiting for it turns a right answer into a dead end. Only
      // auto-submit when the digit count matches the answer's, so a two-digit answer is never cut
      // off mid-entry.
      if (current && entry.length === String(current.answer).length) {
        setTimeout(() => void onSubmit(), 180);
      }
    }

    function onDelete(): void {
      if (locked || entry.length === 0) return;
      entry = entry.slice(0, -1);
      audio.tap();
      updateSlot();
    }

    async function onSubmit(): Promise<void> {
      if (locked || !current || entry === "") return;
      locked = true;
      const fact = current;
      const correct = Number(entry) === fact.answer;
      const ms = performance.now() - questionStart;
      const index = factIndexOf(fact.id);
      const wasBaked = mastery.isBaked(fact.id);

      mastery.record(fact.id, correct, ms);
      attempts.push({ fact, correct, ms });

      const rect = slotEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      if (correct) {
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        slotEl.dataset.status = "correct";
        world.reward(cx, cy, streak);
        store.addSprinkles(1 + Math.min(streak, 5));
        hud.setSprinkles(store.state.sprinkles);

        // The treat is baked *now*, on the first correct answer. Deferring the reward until a fact
        // survives review is pedagogically defensible and emotionally disastrous.
        world.shelf.sync(mastery);
        if (index >= 0) {
          audio.treatBaked(index);
          const target = world.shelf.treatScreenPos(index, skyBox());
          if (target && !world.reducedMotion) {
            world.particles.collect(cx, cy, target, 10, recipe.color);
          }
          if (!wasBaked) {
            world.particles.burst(target?.x ?? cx, target?.y ?? cy, {
              count: 16,
              color: "#FFFFFF",
              speed: 180,
            });
          }
        }

        solved.push(fact);
        answered += 1;
        hud.setProgress(answered);

        await wait(world.reducedMotion ? 200 : 620);
        delete slotEl.dataset.status;

        if (answered >= LESSON_LENGTH) {
          void finish();
          return;
        }
        nextQuestion();
      } else {
        streak = 0;
        slotEl.dataset.status = "retry";
        world.softMiss();
        // A hint, never a correction. The reference app was repeatedly criticised in reviews for
        // harsh wrong-answer copy; here a miss buys you a strategy you can act on.
        promptEl.textContent = factHint(fact);
        await wait(world.reducedMotion ? 260 : 620);
        delete slotEl.dataset.status;
        entry = "";
        updateSlot();
        locked = false;
      }
    }

    async function finish(): Promise<void> {
      store.recordPlaytime();
      const progress = mastery.progress(recipe);
      if (progress.complete) {
        store.markCompleted(recipe.key);
        audio.fanfare();
        world.crumb.setMood("proud");
      }
      store.flush();
      await wait(300);
      void world.go(
        makeSummaryScreen({ recipe, attempts, bestStreak, completed: progress.complete })
      );
    }

    // ---------------------------------------------------------------- canvas

    /**
     * The shelf's drawing box, taken from the real reserved DOM band.
     *
     * The band is shared with the character: Crumb gets a fixed slot on the left and the shelf takes
     * the rest. Letting them both float over the same area means the character keeps landing on top
     * of the very equation the child is reading.
     */
    function companionWidth(rect: DOMRect): number {
      return Math.min(110, rect.width * 0.22);
    }

    function skyBox(): { x: number; y: number; w: number; h: number } {
      const r = skyEl.getBoundingClientRect();
      const cw = companionWidth(r);
      const avail = r.width - cw;
      const w = Math.min(avail, r.height * 2.1);
      return { x: r.left + cw + (avail - w) / 2, y: r.top, w, h: r.height };
    }

    let removeLayer: (() => void) | null = null;
    let removeTick: (() => void) | null = null;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key >= "0" && e.key <= "9") onDigit(e.key);
      else if (e.key === "Backspace") onDelete();
      else if (e.key === "Enter") void onSubmit();
    }

    return {
      element: root,
      mounted() {
        world.showCrumb = true;
        world.setRoom(chapter.room);
        world.shelf.setRecipe(recipe, mastery);
        hud.setSprinkles(store.state.sprinkles, false);
        hud.setProgress(0);
        hud.registerSprinkleTarget();
        nextQuestion();
        window.addEventListener("keydown", onKeyDown);

        removeLayer = world.stage.add((c) => {
          world.shelf.update(c.dt);
          world.shelf.draw(c.ctx, skyBox());
        }, 10);

        removeTick = ticker.add(() => {
          // The character is a companion, not a co-star. Crumb stands in its own slot at the left
          // of the shelf band, where it can react to answers without ever covering the equation.
          // The band is a centred column, so on a tablet it stays beside the content instead of
          // being stranded against the screen edge.
          const r = skyEl.getBoundingClientRect();
          const cw = companionWidth(r);
          world.crumb.setScale(Math.min(0.62, cw / 165));
          world.crumb.moveTo(r.left + cw / 2, r.bottom - world.crumb.bottomExtent * 0.75);
        });
      },
      destroy() {
        window.removeEventListener("keydown", onKeyDown);
        removeLayer?.();
        removeTick?.();
        store.recordPlaytime();
      },
    };
  };
}

/** Convenience: the recipe the player should work on next in their current chapter. */
export function nextRecipeFor(chapterIndex: number): Recipe {
  const chapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0];
  const list = chapterRecipes(chapter);
  return list.find((r) => !store.mastery.progress(r).complete) ?? list[0];
}
