import { el } from "../core/dom";
import { audio } from "../core/audio";
import type { ModeContext, ModeInstance } from "./mode";
import { centreOf } from "./mode";
import { chipRow } from "./props";

/**
 * **The delivery rail** — skip counting, which is what a times table actually is.
 *
 * A cart runs along a rail of stops. For `5 × 4` the stops read 5, 10, 15, ▢, 25 and the child
 * picks the missing one. For `20 ÷ 5` the same rail is drawn with hop numbers above it and the
 * question becomes "how many hops of five to reach twenty?".
 *
 * Multiplication and division are the same picture read in two directions, and drawing them that
 * way is the point of the mode. On a keypad `5 × 4` and `20 ÷ 5` are two unrelated strings of
 * symbols; on the rail they are one journey, once forwards and once counting the steps. Children
 * who learn tables purely as recall hit a wall at division, and this is the standard fix.
 *
 * The rail is capped at six stops. Ten stops of three-digit numbers do not fit across a phone, and
 * a window around the answer is more readable anyway — the child follows the pattern rather than
 * scanning a wall of numbers.
 */
export function railMode(ctx: ModeContext): ModeInstance {
  const f = ctx.asked.fact;
  const dividing = f.op === "div";
  // For `a × b` the step is `a`; for `a ÷ b` the rail steps in `b` and the answer is the hop count.
  const step = dividing ? f.b : f.a;
  const hops = dividing ? f.answer : f.b;
  const total = dividing ? f.a : f.answer;

  const MAX_STOPS = 5;
  const MAX_HOP = 10;
  /**
   * The window of stops to draw.
   *
   * Two rules, and the first one is the whole mode: **the blank is never the first stop**. A child
   * reads a rail left to right and counts the steps; a rail that opens with a question mark gives
   * them nothing to count from. So the window always opens at least two stops before the answer,
   * and only then fills whatever room is left on the right.
   */
  const last = Math.min(MAX_HOP, hops + 1);
  const first = Math.max(1, Math.min(hops - 2, last - MAX_STOPS + 1));
  const stops: number[] = [];
  for (let h = first; h <= Math.min(last, first + MAX_STOPS - 1); h++) stops.push(h);

  let picked: HTMLElement | null = null;

  const rail = el(
    "div",
    { class: "rail__track", dataset: { step } },
    ...stops.map((h) => {
      const value = h * step;
      const isBlank = !dividing && h === hops;
      const isTarget = dividing && h === hops;
      // Past the blank, a multiplication rail shows empty stops. Printing the values there would
      // let the child read the next one and step back, which is a fine strategy but not the one
      // the mode is for — and it makes "what comes next" answerable without counting at all.
      const isAhead = !dividing && h > hops;
      return el(
        "div",
        {
          class: `rail__stop${isBlank ? " is-blank" : ""}${isTarget ? " is-target" : ""}${isAhead ? " is-ahead" : ""}`,
          dataset: { hop: h, value: isAhead ? "" : value },
        },
        dividing ? el("span", { class: "rail__hop" }, `${h}`) : null,
        el("span", { class: "rail__value" }, isBlank ? "?" : isAhead ? "·" : String(value)),
        el("span", { class: "rail__peg", aria: { hidden: true } })
      );
    })
  );

  const answer = dividing ? hops : total;
  const chips = chipRow({
    answer,
    // The mistakes worth catching: landing one stop early or late, and — for division — answering
    // with the total instead of the number of hops, which is the single most common slip.
    seeds: dividing ? [total, f.b, hops + 1] : [total + step, total - step],
    size: 3,
    label: "Choose the answer",
    onPick: (value, chip) => {
      if (ctx.isLocked()) return;
      picked = chip;
      audio.select();
      const ok = value === answer;
      if (!ok) chips.reject(value);
      ctx.commit(ok, String(value));
    },
  });

  const element = el(
    "div",
    { class: `mode mode--rail${dividing ? " mode--rail-div" : ""}`, dataset: { mode: "rail" } },
    el("div", { class: "rail" }, rail),
    chips.element
  );

  return {
    id: "rail",
    element,
    prompt: dividing ? `How many hops of ${step} to reach ${total}?` : "What comes next?",
    spoken: dividing
      ? `The cart hops in ${step}s. How many hops does it take to reach ${total}?`
      : `Counting in ${step}s. Which number is missing?`,
    hint: dividing
      ? `Count the hops along the rail: ${series(step, hops)}.`
      : `Keep adding ${step}: ${series(step, hops)}.`,
    anchor: () => centreOf(picked) ?? centreOf(rail.querySelector(".is-blank, .is-target")),
    retry: () => {
      picked = null;
    },
  };
}

function series(step: number, hops: number): string {
  const out: number[] = [];
  for (let i = 1; i <= Math.min(hops, 6); i++) out.push(i * step);
  return out.join(", ") + (hops > 6 ? ", …" : "");
}
