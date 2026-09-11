import { audio } from "../core/audio";
import { el, clear, setChildren, stagger, wait } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import {
  CHAPTERS,
  chapterRecipes,
  askFact,
  askedHint,
  factText,
  type AskedFact,
  type FactFrame,
  type Recipe,
  type Fact,
} from "../game/curriculum";
import { store } from "../game/store";
import { chapterIsComplete, gameIsComplete } from "../game/progress";
import { KEYPAD_MODES, pickMode, type ModeId } from "../game/modes";
import { MODE_FACTORIES, type ModeInstance } from "../modes";
import { buildStory, ticketCard } from "../modes/story";
import { Hud } from "./hud";
import { makeMapScreen } from "./map";
import { makeSummaryScreen } from "./summary";

/**
 * Questions in one lesson.
 *
 * A cap, not a quota. The first recipe in the game — Sugar Cookies, "ways to make 5" — contains
 * exactly four facts, and asking eight questions from it meant every child's first lesson put the
 * same four sums up twice each, back to back. That is the precise experience of "this is just
 * clicking buttons", delivered in the first ninety seconds. A lesson now never asks more distinct
 * questions than the recipe actually has.
 */
const LESSON_MAX = 8;

/**
 * The range `fitMode` searches for a hands-on mode's prop size.
 *
 * The floor is the smallest counter a five-year-old can reliably hit with a thumb on a phone in
 * landscape; the ceiling stops a lesson with two props in it from turning a bun into a dinner
 * plate. Everything in `modes.css` is expressed as a multiple of the chosen value.
 */
const MODE_PROP_MIN = 18;
const MODE_PROP_MAX = 128;
/**
 * Slack left around a fitted mode, in pixels.
 *
 * A search that maximises size will by definition stop at the value that *just* fits, which looks
 * like a mistake: the three burnt cakes ran edge to edge with the last one grazing the bottom of
 * the phone. Six pixels of enforced air costs one step of the search and reads as deliberate.
 */
const MODE_BREATH = 6;

interface Attempt {
  fact: Fact;
  frame: FactFrame;
  mode: ModeId;
  correct: boolean;
  ms: number;
}

/**
 * The first time a child meets each new way of being asked, stop and introduce it.
 *
 * Dropping a child into a tray of buns with no explanation is the fastest way to make a new
 * interaction feel like a malfunction. One sentence, once ever, and then never again.
 */
const MODE_INTROS: Partial<Record<ModeId, { lines: string[]; cta: string }>> = {
  tray: {
    lines: [
      "Let's use the trays.",
      "Tap the spaces to put buns on, or tap a bun to take it off again. Press the tick when the tray looks right.",
    ],
    cta: "Let me try",
  },
  rail: {
    lines: [
      "Here comes the delivery cart.",
      "It hops along the rail in the same size step every time. Work out where it lands.",
    ],
    cta: "Off we go",
  },
  plates: {
    lines: [
      "Time to share things out.",
      "Tap a plate to put one on it. Keep going until the pile is empty — and remember, every plate gets the same.",
    ],
    cta: "I'll share them",
  },
  slice: {
    lines: [
      "Cakes need cutting.",
      "Tap a cake and the knife does the rest. Cut them all, then count up the slices.",
    ],
    cta: "Pass the knife",
  },
  burnt: {
    lines: [
      "Oh no — something got burnt.",
      "Three cakes, and one of them has the wrong sum on it. Work them out and tap the burnt one.",
    ],
    cta: "I'll find it",
  },
  ticket: {
    lines: [
      "A customer left an order.",
      "Read what they asked for, work out the number, and write it in.",
    ],
    cta: "Read it out",
  },
};

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

    /**
     * How many questions this lesson asks.
     *
     * Never more than the recipe has facts, so nothing is ever asked twice while something else
     * is still unasked.
     */
    const lessonLength = Math.max(1, Math.min(LESSON_MAX, recipe.facts.length));

    /** Sprinkles at the door, so the summary can tell what this lesson actually paid for. */
    const sprinklesAtStart = store.state.sprinkles;

    let current: AskedFact | null = null;
    let entry = "";
    let questionStart = performance.now();
    let answered = 0;
    let streak = 0;
    let bestStreak = 0;
    let locked = false;
    let autoSubmit: ReturnType<typeof setTimeout> | undefined;
    /** The live hands-on mode, when this question is not a keypad one. */
    let mode: ModeInstance | null = null;
    let modeId: ModeId = "keypad";
    /** What the previous question used, so `pickMode` can avoid asking the same way twice. */
    let lastMode: ModeId | null = null;
    /** Wrong attempts on the current question, used to soften the hint the second time. */
    let misses = 0;
    const attempts: Attempt[] = [];
    /** Facts resolved this lesson, newest last — drives the "done" rows of the recipe card. */
    const solved: Fact[] = [];
    /** Everything already asked this lesson, so the picker never doubles back too early. */
    const askedThisLesson = new Set<string>();

    const hud = new Hud(world, {
      segments: lessonLength,
      onBack: () => void world.go(makeMapScreen),
    });

    const ladder = el("div", { class: "ladder", aria: { role: "list", label: "Recipe steps" } });
    const slotEl = el("span", { class: "slot", dataset: { empty: "1" } });

    const promptEl = el("p", {
      class: "prompt lesson__prompt",
      textContent: "Find the missing number",
    });

    /**
     * The "gone stale" note, as its own badge rather than a suffix on the prompt.
     *
     * It used to be appended in brackets, which was fine for "Find the missing number" and absurd
     * for a mode prompt that is already two sentences: "One of these came out wrong. Which one?
     * (this one's gone stale)". Separating them also means the note keeps its meaning — it is about
     * the fact's history, not about this question.
     */
    const staleTag = el("p", { class: "lesson__stale", textContent: "Gone stale — bake it fresh" });
    staleTag.hidden = true;

    const skyEl = el("div", { class: "lesson__shelf" });

    /** Where a hands-on mode mounts. Empty, and `hidden`, on keypad questions. */
    const modeHost = el("div", { class: "lesson__mode" });
    /** Where the order ticket pins itself, above the equation. */
    const ticketHost = el("div", { class: "lesson__ticket" });

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

    const inputBar = el("div", { class: "lesson__input" }, stagger(keypad));

    const bodyEl = el("div", { class: "lesson__body" }, ticketHost, promptEl, staleTag, ladder, modeHost);

    const root = el(
      "div",
      { class: "lesson", dataset: { mode: "keypad" } },
      hud.element,
      skyEl,
      titleEl,
      bodyEl,
      inputBar
    );

    // ---------------------------------------------------------------- recipe card

    function renderLadder(): void {
      setChildren(ladder);
      for (const f of solved.slice(-2)) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "done" }, aria: { role: "listitem" } },
            factText(f, true),
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
              dataset: { role: "active", frame: current.frame },
              aria: { role: "listitem", label: current.spoken },
            },
            current.pre,
            slotEl,
            current.post
          )
        );
      }
      // Two greyed previews of what is coming, so the card reads as a continuing pattern.
      const upcoming = recipe.facts
        .filter((f) => f.id !== current?.fact.id && !solved.some((s) => s.id === f.id))
        .slice(0, 2);
      for (const f of upcoming) {
        ladder.appendChild(
          el(
            "div",
            { class: "ladder__row", dataset: { role: "upcoming" }, aria: { hidden: "true" } },
            factText(f)
          )
        );
      }
      fitLadder();
    }

    /**
     * Shrink any row that is wider than the card.
     *
     * The ladder sets `white-space: nowrap` — an equation broken across two lines stops looking
     * like one thing — and a font size in `rem`. That is safe for `7 + 5 = ▢` and wrong for
     * `1 whole = ▢ halves`, which on a 393px phone ran off *both* edges at once: the child could
     * see `whole = ▢ halve` and had to guess what the question was. Words in the equation are
     * what the fractions chapter is for, so the fix belongs here rather than in the wording.
     *
     * Every contributor to a row's width is in `em` (the gaps, the slot's `min-width`), so width
     * is linear in font size and one measured pass is enough — no binary search, no reflow loop.
     */
    function fitLadder(): void {
      const avail = ladder.clientWidth - 16;
      if (avail <= 0) return;
      for (const row of Array.from(ladder.children) as HTMLElement[]) {
        // Measure unscaled. A centred `nowrap` flex row overflows in both directions at once and
        // `scrollWidth` does not report that, so the natural width has to come from the row's own
        // box — which is why the row must not be width-constrained in CSS.
        row.style.removeProperty("--fit");
        const want = row.getBoundingClientRect().width;
        row.style.setProperty("--fit", want > avail ? String(avail / want) : "1");
      }
    }

    function updateSlot(): void {
      slotEl.textContent = entry || "";
      slotEl.dataset.empty = entry ? "0" : "1";
      fitLadder();
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

    /**
     * Grow a hands-on mode to fill the band it was given.
     *
     * Hiding the keypad frees about a third of the screen, and the first screenshots showed the
     * result: a single cake, correctly drawn, marooned in the middle of an enormous empty room.
     * It read as a bug. Rather than hand-tuning a prop size per mode per breakpoint — six modes
     * times four breakpoints, all of them wrong the moment a recipe has a different number of
     * things in it — the mode is measured at its natural size and scaled up to fit, with the same
     * one-pass technique that fits the equation.
     *
     * Only ever upward, and never past 1.7. Scaling down would shrink tap targets below the size a
     * five-year-old can hit, and the modes are already built to fit at 1.
     */
    /**
     * Grow a hands-on mode until it fills the band it was given.
     *
     * Hiding the keypad frees about a third of the screen, and the first screenshots showed the
     * result: a single cake, correctly drawn, marooned in the middle of an enormous empty room. It
     * read as a bug rather than as a question.
     *
     * The obvious fix — scale the whole mode with a transform — does not work, because a mode is a
     * full-width flex column, so the horizontal ratio is always exactly 1 and clamps everything.
     * What actually wants to grow is the props, and every mode already sizes its props from one
     * custom property. So this searches for the largest `--prop` that still fits in both axes and
     * stops there.
     *
     * A search rather than arithmetic because a mode's height is not linear in `--prop`: labels,
     * gaps and wrapped rows all have fixed parts, and a tray of ten wraps to two rows at exactly
     * one point. Ten layout reads once per question is not worth being clever about.
     */
    /**
     * Size every prop in the mounted mode so the whole thing fits the room it was given.
     *
     * A search rather than arithmetic, because height is not a linear function of `--prop`: labels
     * wrap, rows break and gaps collapse at thresholds. Stepping down from the largest and taking
     * the first value that fits is both simpler and more correct than any formula.
     *
     * The horizontal test walks the descendants rather than reading `scrollWidth`. A centred
     * `nowrap` row that is too wide spills equally off *both* edges, and `scrollWidth` counts only
     * the right-hand side — so the rail could hang 11px off each edge of a phone while the element
     * cheerfully reported that it fitted.
     */
    /**
     * How much height the props may use.
     *
     * Deliberately **not** `modeHost.clientHeight`. The host used to be `flex: 1`, which meant it
     * swallowed every spare pixel; a four-stop number line was then centred inside a 721px void
     * and came to rest at 68% down a tablet screen, with a lake of empty bakery between it and the
     * question it answered. The host is now content-sized so the body can centre the prompt and
     * the props together as one group — and the room is worked out instead, as whatever the body
     * has left once its other children have taken their share.
     */
    function modeRoom(): number {
      // Summed by hand rather than taken from `scrollHeight`, because `scrollHeight` clamps to
      // `clientHeight` whenever the content fits — which makes the room come out as the host's own
      // current height, and a search whose room depends on its own answer collapses to the
      // minimum on the first pass.
      //
      // Margins are included deliberately. Leaving them out put the answer five to eleven pixels
      // over on a landscape phone, which is exactly the band where the tick ends up below the fold.
      const style = getComputedStyle(bodyEl);
      const gap = parseFloat(style.rowGap) || 0;
      const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      let used = 0;
      let items = 0;
      for (const child of Array.from(bodyEl.children) as HTMLElement[]) {
        // Counted by *display*, not by height. An empty ticket host and a hidden stale badge are
        // still flex items with no height — and flex still puts a gap either side of them. Judging
        // by `offsetHeight` missed three gaps, which is how a landscape tray ended up with its
        // tick five pixels below the fold while the fitter believed it had room to spare.
        if (child.hidden || getComputedStyle(child).display === "none") continue;
        items++;
        if (child === modeHost) continue;
        const cs = getComputedStyle(child);
        used += child.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      }
      return bodyEl.clientHeight - pad - used - gap * Math.max(0, items - 1);
    }

    function fitMode(): void {
      if (!mode) return;
      const node = mode.element;
      const roomH = modeRoom();
      const roomW = modeHost.clientWidth;
      // Left on the element on purpose: when a mode overflows, the first question is always
      // "what did the fitter think it had to work with?", and without this the answer needs a
      // debugger attached to a phone.
      modeHost.dataset.room = String(Math.round(roomH));
      if (roomH <= 0 || roomW <= 0) return;

      /**
       * True when the mode's content spills outside the room, measured in *unscaled* pixels.
       *
       * The scale correction is not paranoia. `.mode` enters with `animation: modeIn` which starts
       * at `scale(0.97)`, and `fitMode` runs the instant the mode is mounted — mid-animation. Every
       * rect therefore read 3% narrow, which was enough for a 508px rail to pass as fitting a 492px
       * landscape column and then settle 8px off each edge. Dividing the measured extent by the
       * live scale (`offsetWidth` is immune to transforms, `getBoundingClientRect` is not) makes
       * the test independent of whatever the entry animation is doing at that moment.
       */
      const tooWide = (): boolean => {
        const nodeRect = node.getBoundingClientRect();
        if (nodeRect.width <= 0) return false;
        const scale = node.offsetWidth / nodeRect.width;
        let left = 0;
        let right = node.offsetWidth;
        for (const child of node.querySelectorAll<HTMLElement>("*")) {
          const r = child.getBoundingClientRect();
          if (r.width <= 0) continue;
          left = Math.min(left, (r.left - nodeRect.left) * scale);
          right = Math.max(right, (r.right - nodeRect.left) * scale);
        }
        return right - left > roomW - MODE_BREATH;
      };

      const base = MODE_PROP_MIN;
      let best = base;
      for (let prop = MODE_PROP_MAX; prop > base; prop -= 4) {
        modeHost.style.setProperty("--prop", `${prop}px`);
        if (node.offsetHeight <= roomH - MODE_BREATH && !tooWide()) {
          best = prop;
          break;
        }
      }
      modeHost.style.setProperty("--prop", `${best}px`);
    }

    /** Tear down whatever the last question put on screen. */
    function clearMode(): void {
      mode?.destroy?.();
      mode = null;
      clear(modeHost);
      clear(ticketHost);
      delete modeHost.dataset.status;
    }

    function nextQuestion(): void {
      clearTimeout(autoSubmit);
      const fact = mastery.nextFact(recipe, Date.now(), askedThisLesson);
      if (!fact) {
        void finish();
        return;
      }
      askedThisLesson.add(fact.id);

      const state = mastery.get(fact.id);
      const choice = pickMode(fact, recipe, state, { last: lastMode });
      modeId = choice.mode;
      lastMode = modeId;

      // A fact the child has already baked can be asked the harder way. New material never is:
      // nothing should be introduced in its most demanding form.
      const canGap = choice.allowGap && fact.b !== fact.answer;
      const frame: FactFrame = canGap && (state.seen + fact.a) % 2 === 0 ? "gap" : "direct";
      current = askFact(fact, frame);

      entry = "";
      misses = 0;
      locked = false;
      clearMode();
      questionStart = performance.now();

      const stale = mastery.isStale(fact.id);
      const usesKeypad = KEYPAD_MODES.has(modeId);
      root.dataset.mode = modeId;
      root.dataset.stale = stale ? "1" : "0";
      staleTag.hidden = !stale;
      inputBar.hidden = !usesKeypad;
      ladder.hidden = !usesKeypad;
      modeHost.hidden = usesKeypad;

      if (usesKeypad) {
        renderLadder();
        updateSlot();
        if (modeId === "ticket") {
          // The story rotates with the number of times this fact has been seen, so a child who
          // meets `6 × 4` five times does not get Mrs Pemberly and her boxes five times.
          const story = buildStory(fact, recipe, state.seen);
          setChildren(ticketHost, ticketCard(story));
          promptEl.textContent = story.question;
          root.setAttribute("aria-label", story.spoken);
        } else {
          promptEl.textContent = frame === "gap" ? "How many more?" : "Find the missing number";
        }
      } else {
        const factory = MODE_FACTORIES[modeId];
        // If a mode ever fails to build we must still ask the question, so the keypad is the
        // fallback for everything. A missing manipulative is a disappointment; a stuck lesson is
        // a child who never comes back.
        if (factory) {
          mode = factory({
            asked: current,
            recipe,
            commit: (correct, said) => void resolve(correct, said),
            isLocked: () => locked,
            reducedMotion: world.reducedMotion,
          });
        }
        if (mode) {
          setChildren(modeHost, mode.element);
          promptEl.textContent = mode.prompt;
          modeHost.setAttribute("aria-label", mode.spoken);
          // After layout, not during it: the mode has just been inserted and has no box yet.
          requestAnimationFrame(fitMode);
        } else {
          modeId = "keypad";
          root.dataset.mode = "keypad";
          inputBar.hidden = false;
          ladder.hidden = false;
          modeHost.hidden = true;
          renderLadder();
          updateSlot();
          promptEl.textContent = "Find the missing number";
        }
      }

      world.shelf.setActiveFact(factIndexOf(fact.id));
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
        return;
      }
      // The first gap question is a new *kind* of question, not a new fact. Say so once.
      if (frame === "gap" && store.markSeen("firstGap")) {
        void showBeat(
          [
            "Now a trickier one.",
            "This time the gap is in the middle. How many more do we need to get there?",
          ],
          "I can do that"
        );
        return;
      }
      // …and the same courtesy for each new way of being asked.
      const intro = MODE_INTROS[modeId];
      if (intro && store.markSeen(`mode:${modeId}`)) {
        void showBeat(intro.lines, intro.cta);
      }
    }

    function onDigit(d: string): void {
      if (locked || entry.length >= 3 || !KEYPAD_MODES.has(modeId)) return;
      entry += d;
      audio.key(entry.length - 1);
      updateSlot();
      armAutoSubmit();
    }

    /**
     * Check the answer for a child who forgot to press the tick.
     *
     * Children of this age routinely forget the check button, and waiting for it turns a right
     * answer into a dead end — so the game submits for them. The obvious rule, "submit as soon as
     * the entry has as many digits as the answer", is wrong in a way that only shows up in a
     * playtest: for `4 ÷ 4 = ▢` a child aiming at 11 gets the first `1` submitted *and marked
     * correct* before the second key lands. The game then tells a child they were right when they
     * were not, and writes that into the record the parent report is built from.
     *
     * So the trigger is a pause, not a digit count. Nothing is submitted while the child is still
     * typing, and nothing a child types can be scored before they have finished typing it. The
     * wait is shorter once the entry is already long enough to be an answer, because then the
     * pause most likely means "done" rather than "still hunting for the next key".
     */
    function armAutoSubmit(): void {
      clearTimeout(autoSubmit);
      if (!current || entry === "" || !KEYPAD_MODES.has(modeId)) return;
      // Three digits is the cap: it cannot grow, so there is nothing to wait for.
      if (entry.length >= 3) {
        autoSubmit = setTimeout(() => void onSubmit(), 180);
        return;
      }
      const enough = entry.length >= String(current.expected).length;
      autoSubmit = setTimeout(() => void onSubmit(), enough ? 900 : 1600);
    }

    function onDelete(): void {
      if (locked || entry.length === 0 || !KEYPAD_MODES.has(modeId)) return;
      entry = entry.slice(0, -1);
      audio.tap();
      updateSlot();
      armAutoSubmit();
    }

    async function onSubmit(): Promise<void> {
      clearTimeout(autoSubmit);
      if (locked || !current || entry === "" || !KEYPAD_MODES.has(modeId)) return;
      await resolve(Number(entry) === current.expected, entry);
    }

    /**
     * Score an answer, whichever way it arrived.
     *
     * Every mode funnels through here, and that is the whole reason six interactions were
     * affordable. The reward, the sprinkles, the mastery record, the shelf, the progress bar and
     * the decision to end the lesson are all identical no matter whether the child typed a number,
     * loaded a tray or spotted a burnt cake — which matters more than it sounds, because a child
     * who notices that one kind of question pays better will simply stop doing the others.
     */
    async function resolve(correct: boolean, said: string): Promise<void> {
      clearTimeout(autoSubmit);
      if (locked || !current) return;
      locked = true;
      const asked = current;
      const fact = asked.fact;
      const ms = performance.now() - questionStart;
      const index = factIndexOf(fact.id);
      const wasBaked = mastery.isBaked(fact.id);

      mastery.record(fact.id, correct, ms);
      attempts.push({ fact, frame: asked.frame, mode: modeId, correct, ms });

      // Burst from wherever the answer actually happened — the slot, the bun they tapped, the cake
      // they picked. A sparkle that always starts in the same place stops feeling caused.
      const spot = mode?.anchor?.() ?? centreOfSlot();
      const cx = spot.x;
      const cy = spot.y;

      if (correct) {
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        slotEl.dataset.status = "correct";
        modeHost.dataset.status = "correct";
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
        delete modeHost.dataset.status;

        if (answered >= lessonLength) {
          void finish();
          return;
        }
        nextQuestion();
      } else {
        misses += 1;
        streak = 0;
        slotEl.dataset.status = "retry";
        modeHost.dataset.status = "retry";
        world.softMiss();

        // Three misses and Crumb shows them.
        //
        // Before this, a question a child could not do was a question they stayed on forever: hint,
        // retry, hint, retry, with no exit that a five-year-old would find. That is the point at
        // which a tablet gets handed to an adult, and it is also the point at which the game stops
        // being able to teach anything, because a stuck child is not reading the hint any more.
        // The answer is simply given, nothing is earned for it, and the next question arrives. It
        // is what a teacher does, and the spaced-repetition schedule has already recorded three
        // misses, so the fact will come back soon and often.
        if (misses >= 3) {
          promptEl.textContent = `It was ${asked.expected}. Crumb will show you again soon.`;
          staleTag.hidden = true;
          world.crumb.setMood("encouraging");
          audio.select();
          if (mode) mode.reveal?.();
          await wait(world.reducedMotion ? 700 : 1900);
          delete slotEl.dataset.status;
          delete modeHost.dataset.status;
          entry = "";
          locked = false;
          nextQuestion();
          return;
        }

        // A hint, never a correction. The reference app was repeatedly criticised in reviews for
        // harsh wrong-answer copy; here a miss buys you a strategy you can act on. A mode's own
        // hint is about the thing in front of the child — "give one to every plate, then go round
        // again" — so it wins over the generic strategy line whenever there is one.
        promptEl.textContent =
          misses >= 2 ? secondHint(asked, said) : (mode?.hint ?? askedHint(asked));
        await wait(world.reducedMotion ? 260 : 620);
        delete slotEl.dataset.status;
        delete modeHost.dataset.status;
        entry = "";
        if (mode) mode.retry?.();
        else updateSlot();
        locked = false;
      }
    }

    /**
     * The second hint on the same question.
     *
     * Repeating the first hint verbatim tells a child that the game has nothing more to offer,
     * which is the moment they hand the tablet to an adult. The second time we say something about
     * *their* answer rather than about the method: near misses get named as near misses, which is
     * both true and the most encouraging thing available.
     */
    function secondHint(asked: AskedFact, said: string): string {
      const n = Number(said);
      if (Number.isFinite(n) && Math.abs(n - asked.expected) === 1) return "So close — just one out.";
      if (Number.isFinite(n) && n > asked.expected) return "That's a bit too many. Try a smaller one.";
      if (Number.isFinite(n) && n > 0) return "That's a bit too few. Try a bigger one.";
      return askedHint(asked);
    }

    function centreOfSlot(): { x: number; y: number } {
      const rect = (mode ? modeHost : slotEl).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    async function finish(): Promise<void> {
      store.recordPlaytime();
      const progress = mastery.progress(recipe);
      // "Finished" means finished *for the first time*. Re-baking a shelf that was already full is
      // a good and necessary thing, but it is a restock, not an achievement, and firing the same
      // fanfare for both is how praise stops meaning anything.
      const firstCompletion = progress.complete && store.markCompleted(recipe.key);
      const chapterFinished = firstCompletion && chapterIsComplete(chapter, mastery);
      const gameFinished = chapterFinished && gameIsComplete(mastery);
      if (firstCompletion) {
        audio.fanfare();
        world.crumb.setMood("proud");
      }
      store.flush();
      await wait(300);
      void world.go(
        makeSummaryScreen({
          recipe,
          attempts,
          bestStreak,
          completed: progress.complete,
          firstCompletion,
          chapterFinished: chapterFinished ? chapter : null,
          gameFinished,
          sprinklesAtStart,
        })
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
    let fitObserver: ResizeObserver | null = null;

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
        // Rotating the device, or the display font arriving late, both change how much the
        // equation needs. Re-measure rather than trusting the width we had at first paint.
        fitObserver = new ResizeObserver(() => {
          fitLadder();
          fitMode();
        });
        fitObserver.observe(ladder);
        fitObserver.observe(modeHost);
        void document.fonts?.ready.then(() => fitLadder());

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
        clearTimeout(autoSubmit);
        clearMode();
        fitObserver?.disconnect();
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
