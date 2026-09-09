import { audio } from "../core/audio";
import { el, stagger, wait } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import {
  CHAPTERS,
  chapterConstellations,
  factHint,
  opName,
  opSymbol,
  type Constellation,
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
 * The Constellation lesson — the game's core loop.
 *
 * The reference app shows a vertical ladder of related facts and nothing else; the ladder is a
 * worksheet with a scroll animation. Here the same ladder is wired to a *drawing in the sky*: each
 * solved fact lights one specific star of the constellation being rebuilt, so the child can see
 * both the local pattern (the ladder) and the goal (the shape) at the same time.
 *
 * Layout note: the constellation's canvas box is measured from the real `.lesson__sky` element
 * rather than computed from viewport fractions. An earlier build guessed both independently and
 * they drifted apart at some sizes, with the character landing on top of the equation.
 */
export function makeLessonScreen(constellation: Constellation): (world: World) => ScreenInstance {
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
    /** Facts resolved this lesson, newest last — drives the "done" rows of the ladder. */
    const solved: Fact[] = [];

    const hud = new Hud(world, {
      segments: LESSON_LENGTH,
      onBack: () => void world.go(makeMapScreen),
    });

    const ladder = el("div", { class: "ladder", aria: { role: "list", label: "Number facts" } });
    const slotEl = el("span", { class: "slot", dataset: { empty: "1" } });

    const promptEl = el("p", { class: "prompt lesson__prompt", textContent: "Find the missing number" });

    const skyEl = el("div", { class: "lesson__sky" });

    const titleEl = el(
      "div",
      { class: "lesson__title" },
      el("span", { class: "lesson__constellation", textContent: constellation.name }),
      el("span", { class: "lesson__sub dim", textContent: constellation.subtitle }),
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
        }),
      );
    }

    const root = el(
      "div",
      { class: "lesson" },
      hud.element,
      skyEl,
      titleEl,
      el("div", { class: "lesson__body" }, promptEl, ladder),
      el("div", { class: "lesson__input" }, stagger(keypad)),
    );

    // ---------------------------------------------------------------- ladder

    function renderLadder(): void {
      ladder.replaceChildren();
      for (const f of solved.slice(-2)) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "done" }, aria: { role: "listitem" } },
            `${f.a} ${opSymbol(f.op)} ${f.b} = ${f.answer}`,
            el("span", { class: "ladder__tick", textContent: "✓" }),
          ),
        );
      }
      if (current) {
        ladder.appendChild(
          el(
            "div",
            {
              class: "ladder__row",
              dataset: { role: "active" },
              aria: { role: "listitem", label: `${current.a} ${opName(current.op)} ${current.b} equals what?` },
            },
            `${current.a} ${opSymbol(current.op)} ${current.b} =`,
            slotEl,
          ),
        );
      }
      // Two greyed previews of what is coming, so the ladder reads as a continuing pattern.
      const upcoming = constellation.facts
        .filter((f) => f.id !== current?.id && !solved.some((s) => s.id === f.id))
        .slice(0, 2);
      for (const f of upcoming) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "upcoming" }, aria: { hidden: "true" } },
            `${f.a} ${opSymbol(f.op)} ${f.b} =`,
          ),
        );
      }
    }

    function updateSlot(): void {
      slotEl.textContent = entry || "";
      slotEl.dataset.empty = entry ? "0" : "1";
    }

    // ---------------------------------------------------------------- flow

    function factIndexOf(id: string | undefined): number {
      return id ? constellation.facts.findIndex((f) => f.id === id) : -1;
    }

    function nextQuestion(): void {
      current = mastery.nextFact(constellation, Date.now(), current?.id);
      entry = "";
      locked = false;
      questionStart = performance.now();
      renderLadder();
      updateSlot();
      world.constellation.setActiveFact(factIndexOf(current?.id));
      // A fading star is a *review*, and saying so out loud is what teaches the child that the sky
      // needs tending. Without this the dimming just looks like a bug.
      if (current && mastery.isFading(current.id)) {
        promptEl.textContent = "This star is fading — light it again";
      } else {
        promptEl.textContent = "Find the missing number";
      }
      world.pipkin.setMood("curious");
      setTimeout(() => world.pipkin.setMood("idle"), 900);
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
      const wasLit = mastery.isLit(fact.id);

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
        store.addPips(1 + Math.min(streak, 5));
        hud.setPips(store.state.pips);

        // The star lights *now*, on the first correct answer. Deferring the reward until a fact
        // survives review is pedagogically defensible and emotionally disastrous.
        world.constellation.sync(mastery);
        if (index >= 0) {
          audio.starLight(index);
          const target = world.constellation.starScreenPos(index, skyBox());
          if (target && !world.reducedMotion) {
            world.particles.collect(cx, cy, target, 10, constellation.color);
          }
          if (!wasLit) {
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
      const progress = mastery.progress(constellation);
      if (progress.complete) {
        store.markCompleted(constellation.key);
        audio.fanfare();
        world.pipkin.setMood("proud");
      }
      store.flush();
      await wait(300);
      void world.go(
        makeSummaryScreen({ constellation, attempts, bestStreak, completed: progress.complete }),
      );
    }

    // ---------------------------------------------------------------- canvas

    /**
     * The constellation's drawing box, taken from the real reserved DOM band.
     *
     * The band is shared with the character: the Pipkin gets a fixed slot on the left and the
     * constellation takes the rest. Letting them both float over the same area meant the character
     * kept landing on top of the very equation the child was reading.
     */
    function companionWidth(): number {
      return Math.min(96, world.stage.width * 0.22);
    }

    function skyBox(): { x: number; y: number; w: number; h: number } {
      const r = skyEl.getBoundingClientRect();
      const left = r.left + companionWidth();
      const avail = r.width - companionWidth();
      const w = Math.min(avail, r.height * 2.1);
      return { x: left + (avail - w) / 2, y: r.top, w, h: r.height };
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
        world.showPipkin = true;
        world.setBiome(chapter.biome);
        world.constellation.setConstellation(constellation, mastery);
        hud.setPips(store.state.pips, false);
        hud.setProgress(0);
        hud.registerPipTarget();
        nextQuestion();
        window.addEventListener("keydown", onKeyDown);

        removeLayer = world.stage.add((c) => {
          world.constellation.update(c.dt);
          world.constellation.draw(c.ctx, skyBox());
        }, 10);

        removeTick = ticker.add(() => {
          // The character is a companion, not a co-star. It stands in its own slot at the left of
          // the sky band, where it can react to answers without ever covering the equation.
          const r = skyEl.getBoundingClientRect();
          const cw = companionWidth();
          world.pipkin.setScale(Math.min(0.52, cw / 150));
          world.pipkin.moveTo(r.left + cw / 2, r.bottom - world.pipkin.bottomExtent * 0.75);
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

/** Convenience: the constellation the player should work on next in their current chapter. */
export function nextConstellationFor(chapterIndex: number): Constellation {
  const chapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0];
  const list = chapterConstellations(chapter);
  return list.find((c) => !store.mastery.progress(c).complete) ?? list[0];
}
