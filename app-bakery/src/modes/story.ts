import { el } from "../core/dom";
import type { Fact, Recipe, TreatShape } from "../game/curriculum";

/**
 * **The order ticket** — the same arithmetic, hidden inside something a person says.
 *
 * A customer comes to the counter and asks for something, and the sum is in the asking. `3 + 5`
 * becomes "Mrs Pemberly takes three jam buns, then changes her mind and takes five more."
 *
 * This is the cheapest mode to build and quietly one of the most valuable, because word problems
 * are where primary maths actually goes wrong. Children who are fluent on a page of sums stall
 * completely when the same sum arrives in a sentence, and the reason is that nobody made them
 * practise the translation. Every real use of arithmetic — money, time, cooking, sharing out
 * sweets — arrives as words, never as `3 + 5 = ▢`.
 *
 * The ticket rides on the keypad rather than replacing it, so the child answers the way they
 * already know how. The only new work is the reading, which is the point.
 */

interface Customer {
  name: string;
  /** Used for "then she", "then he", "then they". */
  they: string;
  their: string;
}

const CUSTOMERS: Customer[] = [
  { name: "Mrs Pemberly", they: "she", their: "her" },
  { name: "Old Tom", they: "he", their: "his" },
  { name: "Nana Plum", they: "she", their: "her" },
  { name: "Mr Fig", they: "he", their: "his" },
  { name: "Miss Marigold", they: "she", their: "her" },
  { name: "the twins", they: "they", their: "their" },
  { name: "Doctor Quill", they: "she", their: "her" },
  { name: "the postman", they: "he", their: "his" },
  { name: "the choir", they: "they", their: "their" },
  { name: "Bramble the dog", they: "he", their: "his" },
];

const TREAT_WORDS: Record<TreatShape, [string, string]> = {
  cupcake: ["cupcake", "cupcakes"],
  cookie: ["cookie", "cookies"],
  doughnut: ["doughnut", "doughnuts"],
  pie: ["pie", "pies"],
  bun: ["bun", "buns"],
};

const CONTAINERS = ["box", "bag", "basket", "tin"];

/** Stable small hash, so a fact tends to keep its customer and phrasing between sessions. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export interface Story {
  /** The sentences on the ticket. */
  lines: string[];
  /** The question at the bottom. */
  question: string;
  /** Everything, as one sentence, for a screen reader. */
  spoken: string;
}

export function buildStory(f: Fact, recipe: Recipe, nonce = 0): Story {
  const seed = hash(f.id) + nonce;
  const who = CUSTOMERS[seed % CUSTOMERS.length];
  const shape = recipe.treats[0]?.shape ?? "bun";
  const [one, many] = TREAT_WORDS[shape];
  const box = CONTAINERS[(seed >> 3) % CONTAINERS.length];
  const n = (v: number): string => `${v} ${v === 1 ? one : many}`;
  /** "There is 1 pie" / "There are 3 pies" — a parent reading over a shoulder notices this. */
  const are = (v: number): string => (v === 1 ? "is" : "are");
  const boxOf = (v: number): string => `${v} ${v === 1 ? box : box === "box" ? "boxes" : `${box}s`}`;
  const variant = (seed >> 7) % 2;

  let lines: string[];
  let question: string;

  switch (f.op) {
    case "add":
      lines =
        variant === 0
          ? [`${cap(who.name)} takes ${n(f.a)}.`, `Then ${who.they} take${plural(who)} ${f.b} more.`]
          : [`There ${are(f.a)} ${n(f.a)} on the counter.`, `${cap(who.name)} bring${plural(who)} ${f.b} more from the oven.`];
      question = "How many altogether?";
      break;
    case "sub":
      lines =
        variant === 0
          ? [`The tray holds ${n(f.a)}.`, `${cap(who.name)} buy${plural(who)} ${f.b} of them.`]
          : [`You baked ${n(f.a)} this morning.`, `${cap(who.name)} sold ${f.b} before lunch.`];
      question = "How many are left?";
      break;
    case "mul":
      lines =
        variant === 0
          ? [`${cap(who.name)} order${plural(who)} ${boxOf(f.b)}.`, `Every ${box} holds ${n(f.a)}.`]
          : [`You fill ${boxOf(f.b)} for ${who.name}.`, `Each one takes ${n(f.a)}.`];
      question = "How many is that in total?";
      break;
    case "div":
      lines =
        variant === 0
          ? [`${cap(who.name)} order${plural(who)} ${n(f.a)}.`, `They go into ${boxOf(f.b)}, the same in each.`]
          : [`There ${are(f.a)} ${n(f.a)} to pack.`, `You have ${boxOf(f.b)} and they must match.`];
      question = `How many go in each ${box}?`;
      break;
    default:
      lines = [`${cap(who.name)} order${plural(who)} ${f.a} whole cakes.`];
      question = "How many slices?";
      break;
  }

  return {
    lines,
    question,
    spoken: `${lines.join(" ")} ${question}`,
  };
}

function plural(who: Customer): string {
  // "the twins take", "Mrs Pemberly takes" — the verb has to agree or the ticket reads as broken
  // English to the adult sitting next to the child, which undermines the whole conceit.
  return who.they === "they" ? "" : "s";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The ticket card that sits above the equation on the keypad path. */
export function ticketCard(story: Story): HTMLElement {
  return el(
    "div",
    { class: "ticket", dataset: { mode: "ticket" } },
    el("span", { class: "ticket__pin", aria: { hidden: true } }),
    el("div", { class: "ticket__head" }, "Order"),
    el(
      "div",
      { class: "ticket__body" },
      ...story.lines.map((line) => el("p", { class: "ticket__line" }, line))
    ),
    el("div", { class: "ticket__q" }, story.question)
  );
}
