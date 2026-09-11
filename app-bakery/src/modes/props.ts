import { el } from "../core/dom";
import { drawTreat, TREAT_BASE } from "../render/treats";
import type { TreatShape } from "../game/curriculum";

/**
 * Small props shared by the hands-on question modes.
 *
 * The manipulatives deliberately reuse `drawTreat` — the same function that paints the display
 * case and the shelf. A bun the child taps onto a tray is pixel-for-pixel the bun that ends up
 * behind the glass, and that continuity is most of the reason the modes feel like part of the
 * bakery rather than a worksheet bolted onto it. Drawing them as DOM elements with border-radius
 * would have been a tenth of the work and would have looked like a different app.
 */

/**
 * A single treat as a standalone canvas element, ready to drop into a DOM layout.
 *
 * The sizing is the fiddly part. `drawTreat` works in a unit box where the shape runs to roughly
 * ±1 — a cookie is a circle of *radius* 0.82, not diameter — so passing the intended pixel size
 * straight through draws a treat around 1.7× too big and the canvas clips it into a neat little
 * square with a squiggle on it. Which is exactly what the first screenshots showed: a tray of
 * biscuit-coloured tiles. Halving it, and nudging the centre down by each shape's own base offset,
 * makes the treat sit in its box the way it sits on the shelf.
 */
export function treatNode(
  shape: TreatShape,
  color: string,
  size: number,
  opts: { ghost?: boolean; special?: boolean } = {}
): HTMLCanvasElement {
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = el("canvas", { class: "prop__treat", width: size * dpr, height: size * dpr });
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const draw = size / 2.15;
  // `TREAT_BASE` is how far below the origin each shape rests. Shapes rise about 1.0 above it, so
  // centring means splitting the difference rather than using the box centre.
  const base = TREAT_BASE[shape] ?? 0.82;
  const cy = size / 2 + ((1 - base) / 2) * draw;
  drawTreat(ctx, size / 2, cy, draw, shape, {
    color,
    freshness: opts.ghost ? 0 : 1,
    special: opts.special ?? false,
    stale: false,
    time: 0,
  });
  if (opts.ghost) canvas.style.opacity = "0.26";
  return canvas;
}

/**
 * Plausible wrong answers.
 *
 * A distractor has to be a mistake a child could actually make, or the question degrades into
 * "spot the odd one out" and stops measuring anything. Off-by-one is the counting slip, the
 * operand itself is the classic "answered the wrong part" slip, and one step of the family either
 * way is the skip-counting slip. Anything absurd is filtered out, and if a family is too small to
 * produce enough near-misses the row simply gets shorter rather than silly.
 */
export function distractors(answer: number, count: number, seeds: number[] = []): number[] {
  const near = [
    answer + 1,
    answer - 1,
    ...seeds,
    answer + 2,
    answer - 2,
    answer + 10,
    Math.max(1, answer * 2),
  ];
  const out: number[] = [];
  for (const n of near) {
    if (n > 0 && n !== answer && !out.includes(n) && out.length < count) out.push(n);
  }
  return out;
}

export interface ChipRowOptions {
  answer: number;
  /** Extra plausible wrong answers to prefer over the generic near-misses. */
  seeds?: number[];
  /** How many chips in total, including the right one. */
  size?: number;
  /** Deterministic shuffling, so a test can replay a lesson. */
  rand?: () => number;
  label: string;
  onPick(value: number, chip: HTMLButtonElement): void;
}

export interface ChipRow {
  element: HTMLElement;
  /** Mark a chip wrong and leave it disabled, so the child never picks the same wrong twice. */
  reject(value: number): void;
  disable(): void;
}

/**
 * The answer row used by the choosing modes.
 *
 * Tapping a chip commits immediately. There is no confirm step, because a chip is already a
 * deliberate choice — asking a five-year-old to tap a number and then tap a tick teaches them that
 * their first tap did not count, which is exactly the lesson the auto-submit bug taught by
 * accident in an earlier round.
 */
export function chipRow(opts: ChipRowOptions): ChipRow {
  const size = opts.size ?? 3;
  const rand = opts.rand ?? Math.random;
  const values = [opts.answer, ...distractors(opts.answer, size - 1, opts.seeds ?? [])];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  const chips = new Map<number, HTMLButtonElement>();
  const row = el(
    "div",
    { class: "chips", role: "group", aria: { label: opts.label } },
    ...values.map((v) => {
      const chip = el(
        "button",
        {
          class: "chip",
          type: "button",
          dataset: { value: v },
          on: {
            click: () => {
              if (chip.disabled) return;
              opts.onPick(v, chip);
            },
          },
        },
        String(v)
      );
      chips.set(v, chip);
      return chip;
    })
  );

  return {
    element: row,
    reject(value) {
      const chip = chips.get(value);
      if (!chip) return;
      chip.disabled = true;
      chip.classList.add("chip--wrong");
    },
    disable() {
      for (const chip of chips.values()) chip.disabled = true;
    },
  };
}

/** The big confirm used by the building modes. Mirrors the keypad's tick, deliberately. */
export function readyButton(label: string, onPress: () => void): HTMLButtonElement {
  return el(
    "button",
    {
      class: "modeReady",
      type: "button",
      on: { click: onPress },
      aria: { label },
    },
    el("span", { class: "modeReady__tick" }, "✓"),
    el("span", { class: "modeReady__label" }, label)
  );
}
