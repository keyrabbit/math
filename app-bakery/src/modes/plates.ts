import { el, setChildren } from "../core/dom";
import { audio } from "../core/audio";
import type { ModeContext, ModeInstance } from "./mode";
import { centreOf } from "./mode";
import { chipRow, treatNode } from "./props";

/**
 * **Sharing onto plates** — division as dealing, which is how children actually meet it.
 *
 * A pile of treats and a row of plates. The child taps a plate to put one treat on it, and keeps
 * going until the pile is empty. Then they say how many each plate got.
 *
 * The mode exists because of one specific misconception. Ask a child what twelve shared between
 * three is and a good number of them will deal out four, three and five and be perfectly happy —
 * the pile is gone, everyone got something, job done. Fair sharing is a *constraint* they have to
 * be taught, and no keypad can even show them getting it wrong. Here the unfair plates are sitting
 * right there in front of them, and the app can say the one useful sentence: every plate needs the
 * same.
 *
 * Dealing unevenly is therefore not blocked. It is allowed to happen, and then named.
 */
export function platesMode(ctx: ModeContext): ModeInstance {
  const f = ctx.asked.fact;
  const totalTreats = f.a;
  const plateCount = f.b;
  const perPlate = f.answer;
  const shape = ctx.recipe.treats[0]?.shape ?? "cookie";
  const colour = ctx.recipe.color;

  const counts: number[] = new Array(plateCount).fill(0);
  let remaining = totalTreats;
  let lastTouched: HTMLElement | null = null;
  let phase: "dealing" | "answering" = "dealing";

  const pile = el("div", { class: "plates__pile", aria: { live: "polite" } });
  const row = el("div", { class: "plates__row", dataset: { plates: plateCount } });
  const question = el("div", { class: "plates__question" });

  const chips = chipRow({
    answer: perPlate,
    // Answering with the total, or with the number of plates, are the two slips that mean the
    // child has read the picture but not the question.
    seeds: [totalTreats, plateCount, perPlate + 1],
    size: 3,
    label: "How many on each plate?",
    onPick: (value, chip) => {
      if (ctx.isLocked()) return;
      lastTouched = chip;
      audio.select();
      const ok = value === perPlate;
      if (!ok) chips.reject(value);
      ctx.commit(ok, String(value));
    },
  });
  chips.element.hidden = true;

  const uneven = (): boolean => counts.some((c) => c !== counts[0]);

  const paintPile = (): void => {
    // Above a dozen the pile becomes a wall of buns that tells the child nothing, so it collapses
    // to a stack plus a numeral. Under a dozen every treat is drawn, because being able to see the
    // pile shrink is the feedback that makes dealing feel like dealing.
    if (remaining > 12) {
      setChildren(
        pile,
        treatNode(shape, colour, 56),
        el("span", { class: "plates__pileCount" }, `× ${remaining}`)
      );
    } else {
      setChildren(pile, ...Array.from({ length: remaining }, () => treatNode(shape, colour, 52)));
    }
    pile.dataset.remaining = String(remaining);
    pile.setAttribute("aria-label", `${remaining} left to share`);
  };

  const paintPlates = (): void => {
    setChildren(
      row,
      ...counts.map((n, i) => {
        const plate = el("button", {
          class: `plates__plate${n > 0 ? " is-used" : ""}`,
          type: "button",
          dataset: { index: i, count: n },
          aria: { label: `Plate ${i + 1}, ${n} on it. Tap to add one.` },
        });
        plate.appendChild(
          el(
            "span",
            { class: "plates__stack" },
            ...Array.from({ length: n }, () => treatNode(shape, colour, 52))
          )
        );
        plate.appendChild(el("span", { class: "plates__disc", aria: { hidden: true } }));
        plate.disabled = phase !== "dealing";
        plate.addEventListener("click", () => {
          if (ctx.isLocked() || phase !== "dealing" || remaining === 0) return;
          counts[i] += 1;
          remaining -= 1;
          lastTouched = plate;
          audio.key(i % 4);
          if (remaining === 0) finishDealing();
          else {
            paintPile();
            paintPlates();
          }
        });
        return plate;
      })
    );
  };

  const finishDealing = (): void => {
    phase = "answering";
    paintPile();
    paintPlates();
    if (uneven()) {
      // Not a wrong answer — a wrong *arrangement*. Scoring it would punish a child for exploring
      // exactly the thing the mode was built to surface, so instead the plates get put back and
      // the rule gets said out loud.
      question.textContent = "Every plate needs the same. Let's share them again.";
      question.classList.add("is-nudge");
      audio.softMiss();
      window.setTimeout(() => {
        if (phase !== "answering") return;
        counts.fill(0);
        remaining = totalTreats;
        phase = "dealing";
        question.textContent = "";
        question.classList.remove("is-nudge");
        paintPile();
        paintPlates();
      }, ctx.reducedMotion ? 900 : 1500);
      return;
    }
    question.textContent = "How many on each plate?";
    question.classList.remove("is-nudge");
    chips.element.hidden = false;
    audio.hop();
  };

  const element = el(
    "div",
    { class: "mode mode--plates", dataset: { mode: "plates" } },
    el(
      "div",
      { class: "plates__board" },
      el(
        "div",
        { class: "plates__pileBox" },
        el("span", { class: "plates__pileLabel" }, "to share"),
        pile
      ),
      row
    ),
    question,
    chips.element
  );

  paintPile();
  paintPlates();

  return {
    id: "plates",
    element,
    prompt: `Share ${totalTreats} onto ${plateCount} plates.`,
    spoken: `Share ${totalTreats} treats fairly onto ${plateCount} plates, then say how many are on each.`,
    hint: `Give one to every plate, then go round again. ${plateCount} plates, ${perPlate} times round.`,
    anchor: () => centreOf(lastTouched) ?? centreOf(row),
    retry: () => {
      counts.fill(0);
      remaining = totalTreats;
      phase = "dealing";
      question.textContent = "";
      question.classList.remove("is-nudge");
      chips.element.hidden = true;
      paintPile();
      paintPlates();
    },
  };
}
