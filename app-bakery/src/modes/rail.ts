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
  if (f.op === "add" || f.op === "sub") return countingRail(ctx);
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
      : `Keep adding ${step}: ${series(step, hops - 1)}, and one more hop.`,
    anchor: () => centreOf(picked) ?? centreOf(rail.querySelector(".is-blank, .is-target")),
    reveal: () => {
      // Fill the blank in and finish the sequence, so the whole rail is readable at once. The
      // count the child could not do is then simply *there*, which is the only demonstration this
      // mode can give.
      const blank = rail.querySelector<HTMLElement>(".rail__stop.is-blank .rail__value");
      if (blank) blank.textContent = String(dividing ? hops : hops * step);
      for (const n of rail.querySelectorAll<HTMLElement>(".rail__stop.is-ahead")) {
        n.classList.remove("is-ahead");
        const v = n.querySelector(".rail__value");
        if (v) v.textContent = String(Number(n.dataset.hop) * step);
      }
      chips.disable();
    },
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

/**
 * **The counting rail** — the same track, walked one stop at a time.
 *
 * For `3 + 5` the rail is a plain number line. Crumb stands on 3, and the child is asked which
 * stop he reaches after five hops forward. For `8 − 3` he hops backwards.
 *
 * There are no answer chips here, and that is deliberate. On a number line every stop is labelled
 * — the numbers *are* the scale — so a hidden blank plus a chip row would just be a keypad with
 * extra steps. Instead the rail itself is the answer surface: the child points at the stop. That
 * is a real assessment format, it is how counting on is taught, and a near miss lands on the stop
 * next door, which tells you far more about what the child did than a wrong digit ever does.
 *
 * This variant exists because without it the first two chapters of the game — half its recipes,
 * and every child's first half hour — had exactly one hands-on mode between them.
 */
function countingRail(ctx: ModeContext): ModeInstance {
  const f = ctx.asked.fact;
  const back = f.op === "sub";
  // Count on from the larger addend. `1 + 8` is eight hops from one and one hop from eight, and
  // only the second is the strategy anyone actually teaches — a rail that made a child take eight
  // hops to add one would be teaching the wrong habit while looking like a number line.
  const start = back ? f.a : Math.max(f.a, f.b);
  const jumps = back ? f.b : Math.min(f.a, f.b);
  const landing = f.answer;

  const MAX_STOPS = 8;
  // Show a stop either side of the journey where the number line allows it, so the landing is not
  // stranded on the edge of the track and an over-count has somewhere to go.
  let lo = Math.max(0, Math.min(start, landing) - 1);
  let hi = Math.min(20, Math.max(start, landing) + 1);
  while (hi - lo + 1 > MAX_STOPS) {
    if (hi > Math.max(start, landing)) hi--;
    else if (lo < Math.min(start, landing)) lo++;
    else break;
  }

  let picked: HTMLElement | null = null;
  const stopNodes = new Map<number, HTMLButtonElement>();

  const rail = el(
    "div",
    { class: "rail__track rail__track--count", dataset: { step: 1 } },
    ...range(lo, hi).map((v) => {
      const node = el(
        "button",
        {
          class: `rail__stop rail__stop--pick${v === start ? " is-start" : ""}`,
          type: "button",
          dataset: { hop: v, value: v },
          aria: { label: v === start ? `${v}, Crumb is here` : `${v}` },
          on: {
            click: () => {
              if (ctx.isLocked()) return;
              picked = node;
              audio.select();
              const ok = v === landing;
              node.classList.add(ok ? "is-landed" : "is-out");
              ctx.commit(ok, String(v));
            },
          },
        },
        el("span", { class: "rail__value" }, String(v)),
        el("span", { class: "rail__peg", aria: { hidden: true } })
      ) as HTMLButtonElement;
      stopNodes.set(v, node);
      return node;
    })
  );

  const element = el(
    "div",
    { class: "mode mode--rail mode--rail-count", dataset: { mode: "rail" } },
    el("div", { class: "rail" }, rail)
  );

  const hopWord = jumps === 1 ? "hop" : "hops";
  const way = back ? "back" : "on";
  // Spelled out, not "3". Partly because a five-year-old reads "three hops" more easily than a
  // numeral sitting next to two other numerals, and partly because "He hops on 1." wrapped onto
  // its own line as "1. Where does he land?" — which reads as a numbered list, not a sentence.
  const count = ["zero", "one", "two", "three", "four", "five"][jumps] ?? String(jumps);

  return {
    id: "rail",
    element,
    prompt: `Crumb is on ${start}. He hops ${way} ${count}. Where does he land?`,
    spoken: `Crumb is standing on ${start}. He takes ${count} ${hopWord} ${way}. Tap the stop he lands on.`,
    hint: back
      ? `Put your finger on ${start} and move ${count} ${hopWord} to the left.`
      : `Put your finger on ${start} and move ${count} ${hopWord} to the right.`,
    anchor: () => centreOf(picked) ?? centreOf(stopNodes.get(start) ?? null),
    reveal: () => {
      for (const node of stopNodes.values()) node.disabled = true;
      stopNodes.get(landing)?.classList.add("is-landed");
    },
    retry: () => {
      picked = null;
    },
  };
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}