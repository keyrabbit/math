import { el, setChildren } from "../core/dom";
import { audio } from "../core/audio";
import type { ModeContext, ModeInstance } from "./mode";
import { centreOf } from "./mode";
import { readyButton, treatNode } from "./props";

/**
 * **The tray** — addition and subtraction you can touch.
 *
 * A tray of numbered slots. For `3 + 5` three buns are already on it and locked; the child taps
 * empty slots to add five more and presses the tick. For `8 − 3` the tray starts full and the
 * child lifts buns off.
 *
 * This is counting-on and counting-back, which is the strategy a Reception teacher spends the
 * whole autumn term building, and it is completely invisible on a keypad — a child can type "8"
 * for `3 + 5` from memory, from a lucky guess, or from genuinely understanding that five more than
 * three is eight, and the app cannot tell the difference. Here it can: the tray records how many
 * they put on.
 *
 * The running count sits beside the tray in large type. That is not a giveaway — the child still
 * has to decide when to stop, which is the entire question — but it removes the recount-from-one
 * loop that makes a wrong tap feel like starting again.
 *
 * What *is* a giveaway, and was one until the first screenshots caught it, is the prompt. "Put 7
 * more on the tray" over a tray holding 1 states the answer in the instruction: the child taps
 * seven times and commits 8 without ever meeting the bond. The adding direction now names only the
 * order — "The order is for 8. Fill the tray." — so the missing addend has to be found. The
 * subtracting direction is safe as written, because there the stated number is what to remove and
 * the answer is what remains.
 */
export function trayMode(ctx: ModeContext): ModeInstance {
  const f = ctx.asked.fact;
  const adding = f.op === "add";
  // The tray always holds the larger number: for `3 + 5` it fills to 8, and for `8 − 3` it starts
  // at 8 and empties to 5. Keeping the capacity fixed means the tray does not resize under the
  // child's finger mid-question.
  const capacity = adding ? f.answer : f.a;
  const start = f.a;
  const target = f.answer;
  const shape = ctx.recipe.treats[0]?.shape ?? "bun";
  const colour = ctx.recipe.color;

  /** Which slots currently hold a bun. The first `start` are the ones the tray came with. */
  let filled = start;
  let lastTouched: HTMLElement | null = null;

  const count = el("div", { class: "tray__count", aria: { live: "polite" } }, String(filled));
  const slots = el("div", { class: "tray__slots" });
  const board = el(
    "div",
    { class: "tray__board", dataset: { capacity } },
    slots,
    el(
      "div",
      { class: "tray__readout" },
      el("span", { class: "tray__readoutLabel" }, "on the tray"),
      count
    )
  );

  const paint = (): void => {
    const nodes: HTMLElement[] = [];
    for (let i = 0; i < capacity; i++) {
      const has = i < filled;
      // In the adding direction the buns that came with the tray are part of the question, not
      // part of the answer, so they cannot be removed. In the taking-away direction every bun is
      // fair game, because taking away is the whole job.
      const locked = adding && i < start;
      const slot = el("button", {
        class: `tray__slot${has ? " is-full" : ""}${locked ? " is-locked" : ""}`,
        type: "button",
        dataset: { index: i, filled: has ? "1" : "0" },
        aria: { label: has ? `Bun ${i + 1}. Tap to take it off.` : `Empty space ${i + 1}. Tap to add a bun.` },
      });
      slot.disabled = locked;
      if (has) slot.appendChild(treatNode(shape, colour, 72));
      slot.addEventListener("click", () => {
        if (ctx.isLocked() || locked) return;
        // Only ever change the tray at its edge. Letting a child punch a hole in the middle of a
        // row turns a counting exercise into a puzzle about which gaps count.
        if (has) {
          if (i !== filled - 1) return;
          filled -= 1;
        } else {
          if (i !== filled) return;
          filled += 1;
        }
        audio.key(filled % 4);
        lastTouched = slot;
        paint();
      });
      nodes.push(slot);
    }
    setChildren(slots, ...nodes);
    count.textContent = String(filled);
    board.dataset.filled = String(filled);
    ready.disabled = false;
  };

  const ready = readyButton(adding ? "The tray is ready" : "That's how many are left", () => {
    if (ctx.isLocked()) return;
    ctx.commit(filled === target, String(filled));
  });

  const element = el(
    "div",
    { class: "mode mode--tray", dataset: { mode: "tray", answer: "hidden" } },
    board,
    ready
  );

  paint();

  return {
    id: "tray",
    element,
    prompt: adding
      ? `The order is for ${f.answer}. Fill the tray.`
      : `Take ${f.b} off the tray.`,
    spoken: adding
      ? `There are ${f.a} on the tray. The order is for ${f.answer}. Fill it up, then press the tick.`
      : `There are ${f.a} on the tray. Take ${f.b} off, then press the tick.`,
    hint: adding
      ? `Start at ${f.a} and count on until the tray holds ${f.answer}.`
      : `Start at ${f.a} and count back: ${countBack(f.a, f.b)}.`,
    anchor: () => centreOf(lastTouched) ?? centreOf(board),
    retry: () => {
      // Put the tray back the way it was posed. A child who over-filled it cannot see their
      // mistake from a half-corrected tray, and re-counting from the start is the recovery a
      // teacher would prompt anyway.
      filled = start;
      paint();
    },
  };
}

function countBack(from: number, by: number): string {
  const seq: number[] = [];
  for (let i = 1; i <= Math.min(by, 6); i++) seq.push(from - i);
  return seq.join(", ") + (by > 6 ? ", …" : "");
}
