/**
 * Curriculum model — Crumb's Bakery.
 *
 * The organising unit is the **recipe**: a number (or a times table) together with the complete
 * family of facts that make it. A recipe fills a shelf in the Bakery Case; every fact is a treat
 * on that shelf.
 *
 * The pedagogy is unchanged from the sibling "Pipkin" MVP — this is the same reference-app insight
 * (fact families shown as a related ladder rather than as random drill), reframed as *baking*
 * instead of *astronomy*: for a five-year-old, "let's finish the recipe for 8" is a warmer, more
 * concrete proposition than "let's complete the constellation for 8". The maths is identical.
 *
 * A "bond" family for 8 is:
 *     1+7  2+6  3+5  4+4        (composing)
 *     8−1  8−2  8−3  8−4        (decomposing — the same pairs, seen backwards)
 * Presenting both directions together is what builds the part–whole understanding that makes
 * subtraction easy later. Facts with 0 are excluded: `0 + 11 = 11` teaches nothing and makes a
 * terrible first impression.
 */

export type Operation = "add" | "sub" | "mul" | "div" | "frac";

/** What kind of family a recipe represents. */
export type FamilyKind = "bond" | "table" | "share" | "fraction";

/**
 * The treats a shelf can hold. Every one is drawn procedurally on canvas — no image assets — so a
 * shelf stays crisp at any size and a new treat costs a function rather than an art order.
 */
export type TreatShape = "cupcake" | "cookie" | "doughnut" | "pie" | "bun";

export const TREAT_SHAPES: TreatShape[] = ["cupcake", "cookie", "doughnut", "pie", "bun"];

export interface Fact {
  /** Stable identity, e.g. "add:5+3". This is the mastery key and must never change. */
  id: string;
  op: Operation;
  a: number;
  b: number;
  answer: number;
  /** Key of the recipe this fact belongs to. */
  recipe: string;
}

/** One treat's place on the shelf. Positions are normalised into a 0..1 box. */
export interface TreatSlot {
  x: number;
  y: number;
  shape: TreatShape;
  /** Which shelf row this treat stands on, so the renderer can draw the plank under it. */
  row: number;
}

export interface Recipe {
  /** Stable key, e.g. "bond:8" or "table:6". */
  key: string;
  kind: FamilyKind;
  /** The number this family is built around. */
  number: number;
  name: string;
  /** Short human description, e.g. "Ways to make 8". */
  subtitle: string;
  facts: Fact[];
  /** Where each treat sits in the display case. Deterministic — a recipe always plates the same. */
  treats: TreatSlot[];
  /** How many shelf rows this recipe uses. */
  rows: number;
  /** The icing colour this whole recipe is glazed in. */
  color: string;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  room: string;
  kind: FamilyKind;
  /** Numbers introduced in this chapter. */
  numbers: number[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "kitchen",
    index: 0,
    title: "The Little Kitchen",
    subtitle: "Where Crumb mixes the very first batch",
    room: "kitchen",
    kind: "bond",
    numbers: [5, 6, 7, 8, 9, 10],
  },
  {
    id: "pantry",
    index: 1,
    title: "The Pantry",
    subtitle: "Big jars, bigger numbers",
    room: "pantry",
    kind: "bond",
    numbers: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  },
  {
    id: "market",
    index: 2,
    title: "The Morning Market",
    subtitle: "Treats come in trays and rows",
    room: "market",
    kind: "table",
    numbers: [2, 5, 10, 3, 4, 6, 7, 8, 9],
  },
  {
    id: "bakehouse",
    index: 3,
    title: "The Bakehouse",
    subtitle: "Enough for everyone, shared out fairly",
    room: "bakehouse",
    kind: "share",
    numbers: [2, 5, 10, 3, 4],
  },
  {
    id: "party",
    index: 4,
    title: "The Party Room",
    subtitle: "Where every cake gets sliced",
    room: "party",
    kind: "fraction",
    numbers: [2, 3, 4],
  },
];

/**
 * Recipe names.
 *
 * Every name is a thing a five-year-old can picture and want. The sibling MVP named its fact
 * families after constellations ("The Hourglass", "The Loom"); those are evocative for an adult
 * and meaningless to a child. "Cinnamon Rolls" needs no explanation at all.
 */
const BOND_NAMES: Record<number, string> = {
  5: "Sugar Cookies",
  6: "Jam Tarts",
  7: "Honey Buns",
  8: "Cinnamon Rolls",
  9: "Blueberry Muffins",
  10: "Birthday Cupcakes",
  11: "Pretzel Twists",
  12: "Gingerbread Friends",
  13: "Cheese Straws",
  14: "Apple Turnovers",
  15: "Custard Doughnuts",
  16: "Chocolate Brownies",
  17: "Lemon Drops",
  18: "Poppyseed Rolls",
  19: "Almond Croissants",
  20: "The Big Party Cake",
};

const TRAY_NAMES: Record<number, string> = {
  2: "The Twin Tray",
  3: "The Three-Tier Stand",
  4: "Butter Squares",
  5: "Flower Cookies",
  6: "The Honeycomb Cake",
  7: "Rainbow Sprinkle Buns",
  8: "The Pretzel Batch",
  9: "The Party Platter",
  10: "The Long Baguettes",
};

/**
 * Separate names for the sharing chapter.
 *
 * The Bakehouse originally borrowed the tray names, so "The Three-Tier Stand" was both a
 * three-times-table recipe in The Morning Market and a divide-by-three recipe two chapters later.
 * A child who has already filled that shelf and is shown it again, empty, in a different room has
 * every reason to think the game has lost their work — and the bakery case listed the same name
 * twice with different contents.
 */
const SHARE_NAMES: Record<number, string> = {
  2: "Two Plates Each",
  3: "The Sharing Boxes",
  4: "Four Little Bags",
  5: "The Party Bags",
  6: "Six Paper Cases",
  7: "A Week of Buns",
  8: "The Picnic Baskets",
  9: "Nine Napkin Rolls",
  10: "The Ten Tins",
};

export function opSymbol(op: Operation): string {
  // U+2212 MINUS SIGN, not a hyphen — a hyphen looks broken at display sizes.
  return { add: "+", sub: "−", mul: "×", div: "÷", frac: "×" }[op];
}

export function opName(op: Operation): string {
  return { add: "plus", sub: "minus", mul: "times", div: "divided by", frac: "times" }[op];
}

function factId(op: Operation, a: number, b: number): string {
  return `${op}:${a}${opSymbol(op)}${b}`;
}

/**
 * The pairs that make `n`, smallest part first, excluding 0.
 * For 8: (1,7) (2,6) (3,5) (4,4).
 */
function bondPairs(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 1; a <= Math.floor(n / 2); a++) pairs.push([a, n - a]);
  return pairs;
}

/** Highest multiplier taught for a times table. */
const TABLE_MAX = 10;

export function buildRecipe(kind: FamilyKind, n: number): Recipe {
  const key = `${kind}:${n}`;
  const facts: Fact[] = [];
  let name: string;
  let subtitle: string;

  switch (kind) {
    case "bond": {
      const pairs = bondPairs(n);
      // Compose first (all the additions), then decompose (the same pairs, backwards). Seeing the
      // set in that order is what makes the inverse relationship visible.
      for (const [a, b] of pairs) {
        facts.push({ id: factId("add", a, b), op: "add", a, b, answer: n, recipe: key });
      }
      for (const [a, b] of pairs) {
        facts.push({ id: factId("sub", n, a), op: "sub", a: n, b: a, answer: b, recipe: key });
      }
      name = BOND_NAMES[n] ?? `A Batch of ${n}`;
      subtitle = `Ways to make ${n}`;
      break;
    }
    case "table": {
      for (let k = 1; k <= TABLE_MAX; k++) {
        facts.push({ id: factId("mul", n, k), op: "mul", a: n, b: k, answer: n * k, recipe: key });
      }
      name = TRAY_NAMES[n] ?? `Trays of ${n}`;
      subtitle = `Counting in ${n}s`;
      break;
    }
    case "share": {
      for (let k = 1; k <= TABLE_MAX; k++) {
        facts.push({
          id: factId("div", n * k, n),
          op: "div",
          a: n * k,
          b: n,
          answer: k,
          recipe: key,
        });
      }
      name = SHARE_NAMES[n] ?? `Sharing into ${n}s`;
      subtitle = `Sharing into ${n}s`;
      break;
    }
    case "fraction": {
      const unit = n === 2 ? "halves" : n === 3 ? "thirds" : "quarters";
      for (let k = 1; k <= 8; k++) {
        facts.push({
          id: factId("frac", k, n),
          op: "frac",
          a: k,
          b: n,
          answer: k * n,
          recipe: key,
        });
      }
      name = n === 2 ? "Halved Pies" : n === 3 ? "Cakes in Thirds" : "Quarter Slices";
      subtitle = `Counting whole cakes in ${unit}`;
      break;
    }
  }

  const layout = shelfLayout(key, facts.length, name);
  return {
    key,
    kind,
    number: n,
    name,
    subtitle,
    facts,
    treats: layout.slots,
    rows: layout.rows,
    color: recipeColor(kind, n),
  };
}

/**
 * Each recipe gets its own icing colour. Hue is derived from the key so it is stable, but is kept
 * inside a narrow band per family kind so a chapter still reads as one room.
 *
 * Every band is a colour you could actually ice a cake with. That constraint is what keeps five
 * different chapters looking like one bakery rather than a paint chart.
 */
function recipeColor(kind: FamilyKind, n: number): string {
  const bands: Record<FamilyKind, [number, number]> = {
    bond: [30, 48], // butter → golden honey
    table: [8, 26], // caramel → toffee
    share: [330, 352], // raspberry → strawberry
    fraction: [286, 314], // blackcurrant → party pink
  };
  const [lo, hi] = bands[kind];
  const hue = (lo + ((n * 47) % (hi - lo + 1))) % 360;
  return hslToHex(hue, 72, 72);
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (m: number) => (m + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (m: number) => lN - a * Math.max(-1, Math.min(k(m) - 3, Math.min(9 - k(m), 1)));
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** How many treats stand on one shelf, by how many there are to plate. */
function columnsFor(count: number): number {
  if (count <= 4) return Math.max(1, count);
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  return 5;
}

/** The treat a recipe name literally describes, if it describes one. */
function shapeFromName(name: string): TreatShape | null {
  const n = name.toLowerCase();
  const table: [RegExp, TreatShape][] = [
    [/cupcake|muffin|brownie|cake|squares/, "cupcake"],
    [/cookie|biscuit|gingerbread|drop|straw|baguette|twist|pretzel/, "cookie"],
    [/doughnut|donut|roll|croissant|honeycomb/, "doughnut"],
    [/tart|pie|turnover|slice|platter/, "pie"],
    [/bun|bread|loaf/, "bun"],
  ];
  for (const [re, shape] of table) if (re.test(n)) return shape;
  return null;
}

/**
 * Deterministic shelf layout.
 *
 * The sibling MVP scattered its stars along a seeded spiral, because real constellations are
 * irregular. A display case is the opposite: treats stand in **neat rows**, and that regularity is
 * doing pedagogical work. A bond family plated 4-across means the four "ways to make 8" sit
 * directly above the four subtractions that undo them, so the inverse relationship is visible as a
 * column rather than merely asserted in the copy.
 *
 * The shape assigned to each row is seeded from the recipe key, so a child's Cinnamon Rolls shelf
 * always plates identically — on every device, after every reinstall.
 */
export function shelfLayout(
  key: string,
  count: number,
  name = ""
): { slots: TreatSlot[]; rows: number } {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  if (count === 0) return { slots: [], rows: 0 };

  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  // The shape comes from the recipe's *name* wherever the name says what it is, so a shelf of
  // "Jam Tarts" is actually plated with tarts. Only when the name is ambiguous ("The Party
  // Platter") does it fall back to the seeded choice. Getting this wrong is quietly corrosive: a
  // child who is told they baked sugar cookies and shown four buns learns that the words on the
  // screen do not describe the picture.
  const named = shapeFromName(name);
  const rowShapes: TreatShape[] = [];
  for (let r = 0; r < rows; r++) {
    rowShapes.push(
      named ?? TREAT_SHAPES[Math.floor(rand() * TREAT_SHAPES.length) % TREAT_SHAPES.length]
    );
  }

  const slots: TreatSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // The final row is usually short; centre it rather than leaving a ragged edge.
    const inRow = Math.min(cols, count - row * cols);
    const rowWidth = inRow / cols;
    const x = (col + 0.5) / cols + (1 - rowWidth) / 2;
    const y = rows === 1 ? 0.5 : (row + 0.5) / rows;
    slots.push({ x, y, shape: rowShapes[row], row });
  }
  return { slots, rows };
}

export function chapterRecipes(chapter: Chapter): Recipe[] {
  return chapter.numbers.map((n) => buildRecipe(chapter.kind, n));
}

export function allRecipes(): Recipe[] {
  return CHAPTERS.flatMap(chapterRecipes);
}

/**
 * The name of one slice, for the fractions chapter.
 *
 * The Party Room claims to teach fractions but rendered every question as `3 × 2 = 6`, which is
 * multiplication wearing a fractions label: nothing on screen said "half", so the one idea the
 * chapter exists to teach was the one thing it never showed. Writing it as "3 wholes = 6 halves"
 * keeps the arithmetic identical and makes the question actually about halves.
 */
export function sliceName(n: number, count: number): string {
  const one = n === 2 ? "half" : n === 3 ? "third" : n === 4 ? "quarter" : `${n}th`;
  const many = n === 2 ? "halves" : n === 3 ? "thirds" : n === 4 ? "quarters" : `${n}ths`;
  return count === 1 ? one : many;
}

/** Render a fact's left-hand side for display. */
export function factText(f: Fact, withAnswer = false): string {
  if (f.op === "frac") {
    const lhs = `${f.a} ${f.a === 1 ? "whole" : "wholes"} =`;
    return withAnswer ? `${lhs} ${f.answer} ${sliceName(f.b, f.answer)}` : lhs;
  }
  const lhs = `${f.a} ${opSymbol(f.op)} ${f.b}`;
  return withAnswer ? `${lhs} = ${f.answer}` : `${lhs} =`;
}

export function factSpoken(f: Fact): string {
  if (f.op === "frac") {
    return `How many ${sliceName(f.b, 2)} are in ${f.a} ${f.a === 1 ? "whole" : "wholes"}?`;
  }
  return `${f.a} ${opName(f.op)} ${f.b} equals what?`;
}

/** A strategy hint for a fact — never a correction, always something the child can act on. */
export function factHint(f: Fact): string {
  switch (f.op) {
    case "add":
      return `Start at ${Math.max(f.a, f.b)} and count on ${Math.min(f.a, f.b)} more.`;
    case "sub":
      return `Start at ${f.a} and count back ${f.b}.`;
    case "mul":
      return `That's ${f.b} trays of ${f.a}. Try counting in ${f.a}s.`;
    case "div":
      return `How many ${f.b}s fit inside ${f.a}?`;
    default:
      return `One whole is ${f.b} ${sliceName(f.b, f.b)}. Count in ${f.b}s, once for each whole.`;
  }
}

/**
 * How a fact is *asked*.
 *
 * The same fact can be posed two ways, and they are not the same question:
 *
 *   direct    3 + 5 = ▢     "what do these make?"
 *   gap       3 + ▢ = 8     "how many more do we need?"
 *
 * The second is the harder and more valuable one — missing-addend is the form that builds
 * part–whole understanding, and it is the form that shows up as "3 + ? = 8" in every Year 1
 * workbook. It also happens to be the cheapest possible cure for the thing that makes drill apps
 * unbearable: a recipe with four facts stops being four questions and becomes eight, without
 * inventing any new content or asking the child to learn anything new.
 *
 * The gap frame is only used on facts the child has already baked. New material is always shown
 * the plain way, so nothing is ever introduced in its hardest form.
 */
export type FactFrame = "direct" | "gap";

export interface AskedFact {
  fact: Fact;
  frame: FactFrame;
  /** Text before the blank. */
  pre: string;
  /** Text after the blank. Empty for the direct frame. */
  post: string;
  /** The number the child has to type. */
  expected: number;
  /** Spoken form, for the screen reader. */
  spoken: string;
}

export function askFact(f: Fact, frame: FactFrame): AskedFact {
  const sym = opSymbol(f.op);
  // Fractions are asked in slices, not in times signs — see `factText`. There is no sensible gap
  // frame for "3 wholes = ▢ halves", so the chapter always uses the direct form.
  if (f.op === "frac") {
    return {
      fact: f,
      frame: "direct",
      pre: `${f.a} ${f.a === 1 ? "whole" : "wholes"} = `,
      post: ` ${sliceName(f.b, f.answer)}`,
      expected: f.answer,
      spoken: factSpoken(f),
    };
  }
  if (frame === "gap") {
    return {
      fact: f,
      frame,
      pre: `${f.a} ${sym} `,
      post: ` = ${f.answer}`,
      expected: f.b,
      spoken: `${f.a} ${opName(f.op)} what equals ${f.answer}?`,
    };
  }
  return {
    fact: f,
    frame,
    pre: `${f.a} ${sym} ${f.b} =`,
    post: "",
    expected: f.answer,
    spoken: factSpoken(f),
  };
}

/** The hint for a fact as it was actually asked. A gap question needs different advice. */
export function askedHint(a: AskedFact): string {
  if (a.frame !== "gap") return factHint(a.fact);
  const f = a.fact;
  switch (f.op) {
    case "add":
      return `Start at ${f.a} and count on until you reach ${f.answer}.`;
    case "sub":
      return `${f.a} take away what leaves ${f.answer}?`;
    case "mul":
      return `How many ${f.a}s do you need to make ${f.answer}?`;
    case "div":
      return `Share ${f.a} so that everyone gets ${f.answer}.`;
    default:
      return factHint(f);
  }
}
