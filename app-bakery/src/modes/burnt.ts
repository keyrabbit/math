import { el } from "../core/dom";
import { audio } from "../core/audio";
import { opSymbol, sliceName, type Fact } from "../game/curriculum";
import type { ModeContext, ModeInstance } from "./mode";
import { centreOf } from "./mode";

/**
 * **Spot the burnt one** — the review mode, and the only one that is a joke.
 *
 * Three cakes come out of the oven with sums iced on them. One of them is wrong. Which one burnt?
 *
 * Two reasons this exists. The first is pedagogical: recognising a wrong answer and producing a
 * right one are different skills, and the second is the later and more useful one — it is what
 * checking your own work *is*. A child who can only produce answers has no way to catch their own
 * slips. The second reason is that by the fortieth lesson, being asked "what is six times four"
 * for the ninth time is a test, and being asked which cake got burnt is a game. Identical maths,
 * completely different feeling, and the difference decides whether there is a forty-first lesson.
 *
 * Reserved for facts the child has already slept on, because asking someone to judge an answer
 * they do not yet know is a good way to teach them to distrust themselves.
 */
export function burntMode(ctx: ModeContext): ModeInstance {
  const target = ctx.asked.fact;
  const wrongValue = plausiblyWrong(target);

  // Two honest neighbours from the same family. Same shape, same numbers, so the child cannot win
  // by spotting the odd formatting out — they have to read all three.
  const others = ctx.recipe.facts.filter((x) => x.id !== target.id).slice();
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const cards: { fact: Fact; shown: number; burnt: boolean }[] = [
    { fact: target, shown: wrongValue, burnt: true },
    ...others.slice(0, 2).map((x) => ({ fact: x, shown: x.answer, burnt: false })),
  ];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  let picked: HTMLElement | null = null;

  const tray = el(
    "div",
    { class: "burnt__tray", role: "group", aria: { label: "Three cakes. One is wrong." } },
    ...cards.map((card, i) => {
      const button = el(
        "button",
        {
          class: "burnt__cake",
          type: "button",
          dataset: { index: i, burnt: card.burnt ? "1" : "0", shown: card.shown },
          aria: { label: `${written(card.fact, card.shown)}. Tap if this one is wrong.` },
        },
        el("span", { class: "burnt__glaze", aria: { hidden: true } }),
        el("span", { class: "burnt__sum" }, written(card.fact, card.shown))
      );
      button.addEventListener("click", () => {
        if (ctx.isLocked() || button.disabled) return;
        picked = button;
        audio.select();
        if (card.burnt) {
          button.classList.add("is-burnt");
          ctx.commit(true, written(card.fact, card.shown));
        } else {
          // Mark it good and take it out of play. A child who tries the same cake twice is not
          // learning anything, and the shrinking choice keeps a second attempt honest.
          button.disabled = true;
          button.classList.add("is-fine");
          ctx.commit(false, written(card.fact, card.shown));
        }
      });
      return button;
    })
  );

  const element = el(
    "div",
    { class: "mode mode--burnt", dataset: { mode: "burnt" } },
    tray
  );

  return {
    id: "burnt",
    element,
    prompt: "One of these came out wrong. Which one?",
    spoken: `Three cakes. ${cards.map((c) => written(c.fact, c.shown)).join(". ")}. Tap the one that is wrong.`,
    hint: `Cover the answers with your hand. Work each sum out yourself, then look.`,
    anchor: () => centreOf(picked) ?? centreOf(tray),
    reveal: () => {
      // Burn the right one in front of them, so the answer is the same event a correct tap would
      // have produced rather than a sentence about it.
      const node = tray.querySelector<HTMLElement>('.burnt__cake[data-burnt="1"]');
      node?.classList.add("is-burnt");
      for (const n of tray.querySelectorAll<HTMLButtonElement>(".burnt__cake")) n.disabled = true;
    },
    retry: () => {
      picked = null;
    },
  };
}

/** An equation as it appears in icing, with whatever answer the cake claims. */
function written(f: Fact, shown: number): string {
  if (f.op === "frac") {
    return `${f.a} ${f.a === 1 ? "whole" : "wholes"} = ${shown} ${sliceName(f.b, shown)}`;
  }
  return `${f.a} ${opSymbol(f.op)} ${f.b} = ${shown}`;
}

/**
 * A wrong answer worth putting on a cake.
 *
 * It has to be wrong in a way a real child would be wrong, or the mode teaches pattern-matching
 * instead of arithmetic — nobody has to know their four times table to reject `4 × 6 = 91`. So the
 * fakes are off-by-one, one step of the family out, and the operands swapped into the answer:
 * exactly the slips the mastery log is full of.
 */
function plausiblyWrong(f: Fact): number {
  const candidates: number[] = [];
  switch (f.op) {
    case "add":
    case "sub":
      candidates.push(f.answer + 1, f.answer - 1, f.answer + 2);
      break;
    case "mul":
      candidates.push(f.answer + f.a, f.answer - f.a, f.answer + 1);
      break;
    case "div":
      candidates.push(f.answer + 1, f.answer - 1, f.b);
      break;
    case "frac":
      candidates.push(f.answer + f.b, f.answer - f.b, f.answer + 1);
      break;
  }
  const ok = candidates.filter((n) => n > 0 && n !== f.answer);
  return ok.length > 0 ? ok[Math.floor(Math.random() * ok.length)] : f.answer + 1;
}
