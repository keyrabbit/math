import type { Fact, Recipe } from "./curriculum";
import type { FactState } from "./mastery";
import { RETAINED_BOX } from "./mastery";

/**
 * How a question is *asked* — the thing the child's hands do.
 *
 * The honest criticism of the first eight playtests was that Crumb's Bakery is a good drill app
 * wearing a game's clothes: a child who fills every shelf has typed digits into the same box about
 * five hundred times. The maths was varied, the *interaction* never was, and a five-year-old
 * cannot tell those two things apart. Twenty minutes in, "I am learning to bake" collapses into
 * "I am pressing numbers".
 *
 * So a fact is no longer bound to one presentation. Each one can be asked in several ways, and
 * which way is chosen depends on **how well the child already knows it**:
 *
 *   box 0-1   manipulative — the child builds the answer out of things they can see and touch.
 *             A tray they load with buns, a cake they cut, plates they deal onto. This is how the
 *             idea gets in, and it is the mode a Reception classroom would use.
 *   box 2-4   symbolic — the keypad, in both frames (`3 + 5 = ▢` and `3 + ▢ = 8`), and the order
 *             ticket, which is the same arithmetic hidden inside a sentence someone says out loud.
 *   box 4+    judgement — three iced sums, one of them wrong; find it. Recognising a wrong answer
 *             is a different and later skill from producing a right one, and it is the one that
 *             makes review feel like a game rather than a re-test.
 *
 * That ordering is not decoration. Concrete-then-abstract is the single most robust finding in
 * primary maths pedagogy, and doing it per-fact rather than per-chapter means the child meets each
 * new number the gentle way and each old number the demanding way, in the same lesson.
 */
export type ModeId = "tray" | "rail" | "plates" | "slice" | "keypad" | "ticket" | "burnt";

/**
 * Modes whose answer is typed.
 *
 * These two ride on the lesson's existing equation-and-keypad path rather than replacing it — the
 * order ticket is the plain keypad question with a customer's words pinned above it. That is a
 * deliberate restraint: the keypad path carries the auto-submit timing, the text fitting and the
 * two question frames, all of which were expensive to get right, and none of which the story mode
 * has any reason to reimplement.
 */
export const KEYPAD_MODES: ReadonlySet<ModeId> = new Set<ModeId>(["keypad", "ticket"]);

export interface ModeChoice {
  mode: ModeId;
  /** The keypad modes are the only ones that can pose the missing-number frame. */
  allowGap: boolean;
}

/**
 * Which modes can express which facts.
 *
 * A mode is not a skin. The tray can show `3 + 5` because you can put five more buns on a tray of
 * three; it cannot show `7 × 8`, because 56 buns is not a thing a child can count on a phone. Each
 * entry below is a statement about what the interaction can honestly represent, and the ceilings
 * are the point.
 */
function fits(mode: ModeId, f: Fact, r: Recipe): boolean {
  switch (mode) {
    case "tray":
      // Counting on or back, one bun at a time. Above twenty this stops being counting and starts
      // being tedium, which is the opposite of what the mode is for.
      return (f.op === "add" || f.op === "sub") && Math.max(f.a, f.b, f.answer) <= 20;
    case "rail":
      // Skip counting along a rail of multiples. This is the skill a times table *is*, and it is
      // the one thing a keypad can never show, because the sequence is the answer.
      //
      // Three hops minimum. The rail asks "what comes next", and for `5 × 1` there is no *next*
      // — the blank lands on the very first stop with nothing in front of it to count from, which
      // is a picture of a question rather than a question. The first screenshots showed exactly
      // that: a rail reading "? 10 15".
      return (f.op === "mul" ? f.b >= 3 : f.answer >= 3) && r.number >= 2;
    case "plates":
      // Dealing out. Needs few enough plates to fit across a phone and few enough treats per plate
      // to count without a headache.
      return f.op === "div" && f.b <= 6 && f.answer <= 10;
    case "slice":
      return f.op === "frac" && f.answer <= 16;
    case "burnt":
      // Judgement needs two plausible neighbours to hide the wrong one among, which every family
      // in the game has.
      return r.facts.length >= 3;
    case "ticket":
      // A customer can ask for anything except a fraction identity — "I would like three wholes
      // expressed in halves please" is not a sentence.
      return f.op !== "frac";
    case "keypad":
      return true;
  }
}

/**
 * Pick how to ask this fact.
 *
 * Three rules, in order, and they are all about the child rather than about variety for its own
 * sake:
 *
 *  1. **A fact the child has never got right is always asked concretely** if a concrete mode can
 *     express it. Nothing is introduced in a form the child cannot build.
 *  2. **A mode is never repeated twice running** inside a lesson while another one fits. Novelty
 *     is the entire point; two trays in a row is a tray with extra steps.
 *  3. **Judgement is reserved for facts that have survived a night's sleep.** Asking a child to
 *     spot a wrong answer among three when they do not yet know the right one teaches them to
 *     doubt themselves.
 *
 * `rand` is passed in so a lesson can be replayed deterministically in a test.
 */
export function pickMode(
  f: Fact,
  r: Recipe,
  state: FactState,
  opts: { last?: ModeId | null; rand?: () => number } = {}
): ModeChoice {
  const rand = opts.rand ?? Math.random;
  const last = opts.last ?? null;
  const can = (m: ModeId): boolean => fits(m, f, r);

  /** Choose from a shortlist, skipping the mode we just used unless it is the only option. */
  const choose = (list: ModeId[]): ModeId => {
    const ok = list.filter(can);
    if (ok.length === 0) return "keypad";
    const fresh = ok.filter((m) => m !== last);
    const pool = fresh.length > 0 ? fresh : ok;
    return pool[Math.floor(rand() * pool.length)];
  };

  // 1. Brand new, or knocked back to zero. Build it, do not type it.
  if (state.box === 0) {
    const mode = choose(["tray", "rail", "plates", "slice"]);
    return { mode, allowGap: false };
  }

  // 2. Well known and rested. Mostly judgement and words; the keypad is the change of pace here.
  if (state.box >= RETAINED_BOX) {
    const mode = choose(["burnt", "ticket", "keypad", "rail"]);
    return { mode, allowGap: mode === "keypad" };
  }

  // 3. Learned but still bedding in. The symbolic forms, with the concrete one still available so
  //    a child who is shaky on a fact can see it built again rather than only tested.
  const mode = choose(["keypad", "ticket", "keypad", "tray", "rail", "plates", "slice"]);
  return { mode, allowGap: mode === "keypad" && state.box >= 2 };
}

/** Human name, used in the parent report and in the practice log. */
export function modeName(mode: ModeId): string {
  return {
    tray: "loading a tray",
    rail: "counting in steps",
    plates: "sharing onto plates",
    slice: "cutting cakes",
    keypad: "writing the answer",
    ticket: "reading an order",
    burnt: "spotting the mistake",
  }[mode];
}
