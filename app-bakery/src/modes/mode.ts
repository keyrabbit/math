import type { AskedFact, Recipe } from "../game/curriculum";
import type { ModeId } from "../game/modes";

/**
 * The contract between the lesson and a question mode.
 *
 * The lesson owns everything that must behave identically whatever the child is doing — the
 * progress bar, the reward burst, the sprinkles, the mastery record, when the lesson ends. A mode
 * owns exactly one thing: how this particular question is put to the child and how they answer it.
 *
 * Keeping that line sharp is what makes six interactions cost roughly what one cost. It is also
 * what stops the reward from feeling different depending on which mode you happened to get, which
 * would quietly teach a child that some questions are worth more than others.
 */
export interface ModeContext {
  asked: AskedFact;
  recipe: Recipe;
  /** Commit the child's answer. Call once per attempt; the lesson re-arms on a miss. */
  commit(correct: boolean, said: string): void;
  /** True while the lesson is animating a result — a mode must ignore input then. */
  isLocked(): boolean;
  reducedMotion: boolean;
}

export interface ModeInstance {
  id: ModeId;
  element: HTMLElement;
  /** The line above the stage. Every mode says what to do, in words a five-year-old can read. */
  prompt: string;
  /** The same thing, as a sentence, for a screen reader. */
  spoken: string;
  /** A hint after a miss. Falls back to the fact's own strategy hint when absent. */
  hint?: string;
  /** Put the mode back to a state the child can answer from, after a wrong answer. */
  retry?(): void;
  /**
   * Put the props into the state that would have been the right answer.
   *
   * Called once, when the lesson gives up on the child's behalf after three misses. A number read
   * out is a fact; a tray filled to eight in front of them is a demonstration, and the second one
   * is what the mode existed to provide in the first place.
   */
  reveal?(): void;
  /**
   * Where the reward should burst from — the treat the child just made, not a fixed point. The
   * whole feel of "I did that" comes from the sparkle starting where their finger was.
   */
  anchor?(): { x: number; y: number } | null;
  destroy?(): void;
}

export type ModeFactory = (ctx: ModeContext) => ModeInstance;

/** Centre of an element in viewport coordinates, for reward anchoring. */
export function centreOf(node: Element | null): { x: number; y: number } | null {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
