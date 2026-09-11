import { el, setChildren } from "../core/dom";
import { audio } from "../core/audio";
import { sliceName } from "../game/curriculum";
import type { ModeContext, ModeInstance } from "./mode";
import { centreOf } from "./mode";
import { chipRow } from "./props";

/**
 * **Cutting the cakes** — fractions you can see happen.
 *
 * Whole cakes on a board. Tap one and it splits into halves, thirds or quarters with a knife
 * sound; tap the next; keep going. When every cake is cut, say how many slices there are.
 *
 * "Three wholes equals how many quarters" is, on a keypad, a multiplication with unusual words
 * around it — and children pass it by spotting that the answer is always the two numbers
 * multiplied, without ever picturing a cake. That trick works right up until they meet a fraction
 * problem that is not this shape, and then nothing transfers, because there was never a mental
 * image underneath it.
 *
 * Cutting is slower and worth it. The child watches three cakes become twelve quarters, and the
 * multiplication turns into a description of something they just did.
 */
export function sliceMode(ctx: ModeContext): ModeInstance {
  const f = ctx.asked.fact;
  const wholes = f.a;
  const per = f.b;
  const total = f.answer;
  const colour = ctx.recipe.color;
  const name = sliceName(per, 2);

  const cut: boolean[] = new Array(wholes).fill(false);
  let lastTouched: HTMLElement | null = null;
  let answering = false;

  const board = el("div", { class: "slice__board", dataset: { wholes } });
  const tally = el("div", { class: "slice__tally", aria: { live: "polite" } });
  const question = el("div", { class: "slice__question" });

  const chips = chipRow({
    answer: total,
    // Answering with the number of cakes, or with the number of slices in one cake, means the
    // child cut correctly but answered a different question — worth catching separately from a
    // miscount.
    seeds: [wholes, per, total - per],
    size: 3,
    label: `How many ${name}?`,
    onPick: (value, chip) => {
      if (ctx.isLocked()) return;
      lastTouched = chip;
      audio.select();
      const ok = value === total;
      if (!ok) chips.reject(value);
      ctx.commit(ok, String(value));
    },
  });
  chips.element.hidden = true;

  const paint = (): void => {
    setChildren(
      board,
      ...cut.map((isCut, i) => {
        const cake = el("button", {
          class: `slice__cake${isCut ? " is-cut" : ""}`,
          type: "button",
          dataset: { index: i, cut: isCut ? "1" : "0", parts: isCut ? per : 1 },
          aria: { label: isCut ? `Cake ${i + 1}, cut into ${per} ${sliceName(per, per)}.` : `Whole cake ${i + 1}. Tap to cut it.` },
        });
        cake.appendChild(cakeArt(colour, isCut ? per : 1, 280, isCut ? 0 : per));
        cake.disabled = answering;
        cake.addEventListener("click", () => {
          if (ctx.isLocked() || answering || cut[i]) return;
          cut[i] = true;
          lastTouched = cake;
          audio.treatBaked(i % 4);
          paint();
          if (cut.every(Boolean)) finishCutting();
        });
        return cake;
      })
    );
    const slices = cut.reduce((n, isCut) => n + (isCut ? per : 0), 0);
    tally.textContent = cut.some(Boolean) ? `${slices} ${sliceName(per, slices)} so far` : "";
  };

  const finishCutting = (): void => {
    answering = true;
    paint();
    question.textContent = `So how many ${name} altogether?`;
    chips.element.hidden = false;
    audio.hop();
  };

  const element = el(
    "div",
    { class: "mode mode--slice", dataset: { mode: "slice" } },
    board,
    tally,
    question,
    chips.element
  );

  paint();

  return {
    id: "slice",
    element,
    prompt: `Cut every cake into ${name}.`,
    spoken: `There are ${wholes} whole cakes. Cut each one into ${per} ${sliceName(per, per)}, then say how many ${name} there are.`,
    hint: `Each cake makes ${per}. Count them up: ${Array.from({ length: Math.min(wholes, 6) }, (_, i) => (i + 1) * per).join(", ")}.`,
    anchor: () => centreOf(lastTouched) ?? centreOf(board),
    retry: () => {
      answering = false;
      chips.element.hidden = true;
      question.textContent = "";
      paint();
    },
  };
}

/**
 * A cake, whole or in wedges.
 *
 * Drawn rather than composed from DOM elements because the cut has to read instantly at thumbnail
 * size: real gaps between wedges, each one pulled a little away from the centre, so a quartered
 * cake looks like four things and not like a circle with lines on it. That distinction is the
 * entire visual argument the mode is making.
 *
 * `guides` draws the dashed cut lines on an uncut cake. Without them the first screenshot showed a
 * plain pink disc under the words "cut every cake into quarters", which tells a child neither that
 * the cake is tappable nor what cutting it would mean. The guides are the affordance and the
 * instruction at once.
 */
function cakeArt(colour: string, parts: number, size: number, guides = 0): HTMLCanvasElement {
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = el("canvas", { class: "slice__art", width: size * dpr, height: size * dpr });
  // No inline display size: modes.css sizes the cake from --prop, and size is only the
  // backing resolution. Drawn generously so one canvas stays crisp from a 320px phone to a tablet.
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const gap = parts > 1 ? size * 0.035 : 0;
  const sweep = (Math.PI * 2) / parts;

  for (let i = 0; i < parts; i++) {
    const mid = -Math.PI / 2 + sweep * (i + 0.5);
    const ox = Math.cos(mid) * gap;
    const oy = Math.sin(mid) * gap;
    const from = -Math.PI / 2 + sweep * i;
    const to = from + sweep;

    ctx.save();
    ctx.translate(ox, oy);

    ctx.beginPath();
    if (parts === 1) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else {
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, from, to);
      ctx.closePath();
    }
    ctx.fillStyle = "#F3E2C7";
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 58, 34, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Icing, inset so the sponge shows as a rim — the same two-tone treatment the shelf treats use.
    ctx.beginPath();
    if (parts === 1) ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    else {
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * 0.78, from + 0.08, to - 0.08);
      ctx.closePath();
    }
    ctx.fillStyle = colour;
    ctx.fill();

    ctx.restore();
  }

  // Swirls of piped icing, so a whole cake looks baked rather than drawn. Kept inside the icing
  // radius and away from the cut lines.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#FFF6E8";
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * 2 * i) / 7 + 0.4;
    const rr = r * (i % 2 === 0 ? 0.46 : 0.64);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, size * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (guides > 1) {
    // Dashed spokes showing where the knife will go: the cake's own instructions.
    ctx.save();
    ctx.strokeStyle = "rgba(90, 58, 34, 0.55)";
    ctx.lineWidth = Math.max(1.5, size * 0.012);
    ctx.setLineDash([size * 0.035, size * 0.03]);
    ctx.lineCap = "round";
    for (let i = 0; i < guides; i++) {
      const a = -Math.PI / 2 + ((Math.PI * 2) / guides) * i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1);
      ctx.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
      ctx.stroke();
    }
    ctx.restore();
  }

  return canvas;
}
