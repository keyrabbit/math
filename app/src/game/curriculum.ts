/**
 * Curriculum model.
 *
 * The organising unit is the **constellation**: a number (or a times table) together with the
 * complete family of facts that make it.
 *
 * This is the reference app's one genuinely strong pedagogical idea — fact families shown as a
 * related ladder rather than as random drill — promoted from a UI detail to the game's core data
 * structure and its reward. Research into the reference app confirms it has no narrative at all
 * ("not so much lessons, but really collections of drills" — Common Sense Media); tying the ladder
 * to a constellation the child is rebuilding is the differentiator.
 *
 * A "bond" family for 8 is:
 *     1+7  2+6  3+5  4+4        (composing)
 *     8−1  8−2  8−3  8−4        (decomposing — the same pairs, seen backwards)
 * Presenting both directions together is what builds the part–whole understanding that makes
 * subtraction easy later. Facts with 0 are excluded: `0 + 11 = 11` teaches nothing and makes a
 * terrible first impression.
 */

export type Operation = "add" | "sub" | "mul" | "div" | "frac";

/** What kind of family a constellation represents. */
export type FamilyKind = "bond" | "table" | "share" | "fraction";

export interface Fact {
  /** Stable identity, e.g. "add:5+3". This is the mastery key and must never change. */
  id: string;
  op: Operation;
  a: number;
  b: number;
  answer: number;
  /** Key of the constellation this fact belongs to. */
  constellation: string;
}

export interface Constellation {
  /** Stable key, e.g. "bond:8" or "table:6". */
  key: string;
  kind: FamilyKind;
  /** The number this family is built around. */
  number: number;
  name: string;
  /** Short human description, e.g. "Ways to make 8". */
  subtitle: string;
  facts: Fact[];
  /** Star positions in normalised 0..1 space, generated deterministically from the key. */
  stars: { x: number; y: number }[];
  /** Index pairs joined by a line. Also deterministic — the shape must never change. */
  links: [number, number][];
  /** The constellation's own light colour. */
  color: string;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  biome: string;
  kind: FamilyKind;
  /** Numbers introduced in this chapter. */
  numbers: number[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "meadow",
    index: 0,
    title: "Lantern Meadow",
    subtitle: "Where the first counting-stars fell",
    biome: "meadow",
    kind: "bond",
    numbers: [5, 6, 7, 8, 9, 10],
  },
  {
    id: "harbour",
    index: 1,
    title: "Tideglass Harbour",
    subtitle: "The tide counts higher here",
    biome: "harbour",
    kind: "bond",
    numbers: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  },
  {
    id: "orchard",
    index: 2,
    title: "Ember Orchard",
    subtitle: "Stars grow in rows and columns",
    biome: "orchard",
    kind: "table",
    numbers: [2, 5, 10, 3, 4, 6, 7, 8, 9],
  },
  {
    id: "canyon",
    index: 3,
    title: "Whisper Canyon",
    subtitle: "Every star can be shared out",
    biome: "canyon",
    kind: "share",
    numbers: [2, 5, 10, 3, 4],
  },
  {
    id: "observatory",
    index: 4,
    title: "The Observatory",
    subtitle: "Where the whole sky comes together",
    biome: "observatory",
    kind: "fraction",
    numbers: [2, 3, 4],
  },
];

const BOND_NAMES: Record<number, string> = {
  5: "The Open Hand",
  6: "The Beetle",
  7: "The Ladle",
  8: "The Hourglass",
  9: "The Cat",
  10: "The Bridge",
  11: "The Mast",
  12: "The Clockface",
  13: "The Thorn",
  14: "The Twin Sails",
  15: "The Crown",
  16: "The Loom",
  17: "The Arrow",
  18: "The Orchard Gate",
  19: "The Watcher",
  20: "The Great Span",
};

const TABLE_NAMES: Record<number, string> = {
  2: "The Twins",
  3: "The Tripod",
  4: "The Lantern Frame",
  5: "The Starfish",
  6: "The Honeycomb",
  7: "The Rainbow",
  8: "The Spider",
  9: "The Fanfare",
  10: "The Long Bridge",
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

export function buildConstellation(kind: FamilyKind, n: number): Constellation {
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
        facts.push({ id: factId("add", a, b), op: "add", a, b, answer: n, constellation: key });
      }
      for (const [a, b] of pairs) {
        facts.push({ id: factId("sub", n, a), op: "sub", a: n, b: a, answer: b, constellation: key });
      }
      name = BOND_NAMES[n] ?? `The ${n}`;
      subtitle = `Ways to make ${n}`;
      break;
    }
    case "table": {
      for (let k = 1; k <= TABLE_MAX; k++) {
        facts.push({ id: factId("mul", n, k), op: "mul", a: n, b: k, answer: n * k, constellation: key });
      }
      name = TABLE_NAMES[n] ?? `The ${n}s`;
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
          constellation: key,
        });
      }
      name = TABLE_NAMES[n] ?? `The ${n}s`;
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
          constellation: key,
        });
      }
      name = n === 2 ? "The Halves" : n === 3 ? "The Thirds" : "The Quarters";
      subtitle = `How many ${unit} in each whole`;
      break;
    }
  }

  const stars = starLayout(key, facts.length);
  return {
    key,
    kind,
    number: n,
    name,
    subtitle,
    facts,
    stars,
    links: linkPath(stars),
    color: constellationColor(kind, n),
  };
}

/**
 * The joining lines.
 *
 * Stars are laid out along a seeded spiral walk, so joining them in index order already traces a
 * readable path. One extra chord is added between the two stars that happen to be closest but are
 * not already neighbours, which is what gives real constellations their characteristic "not quite
 * a line, not quite a loop" silhouette.
 */
function linkPath(stars: { x: number; y: number }[]): [number, number][] {
  const links: [number, number][] = [];
  for (let i = 0; i < stars.length - 1; i++) links.push([i, i + 1]);
  if (stars.length < 4) return links;

  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 2; j < stars.length; j++) {
      const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
  }
  if (best) links.push(best);
  return links;
}

/**
 * Each constellation gets its own light. Hue is derived from the key so it is stable, but is kept
 * inside a narrow band per family kind so a chapter still reads as one place.
 *
 * Saturation is deliberately below full: at 88% the gold families rendered as highlighter-yellow
 * against the purple sky, which looked cheap rather than luminous.
 */
function constellationColor(kind: FamilyKind, n: number): string {
  const bands: Record<FamilyKind, [number, number]> = {
    bond: [36, 58], // gold → warm amber
    table: [10, 30], // ember → orange
    share: [178, 202], // teal → sky
    fraction: [266, 292], // violet
  };
  const [lo, hi] = bands[kind];
  const hue = lo + ((n * 47) % (hi - lo + 1));
  return hslToHex(hue, 70, 74);
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

/**
 * Deterministic star layout.
 *
 * The same key always produces the same shape, on every device and after every reinstall — the
 * child's "Hourglass" must always be the Hourglass. A seeded spiral walk with per-point jitter
 * gives shapes that read as plausible constellations rather than as scattered dots. The result is
 * then normalised into the unit box so every constellation fills its frame regardless of the shape
 * the walk happened to produce.
 */
export function starLayout(key: string, count: number): { x: number; y: number }[] {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i++) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const pts: { x: number; y: number }[] = [];
  const turns = 0.7 + rand() * 0.7;
  const startAngle = rand() * Math.PI * 2;
  const squash = 0.72 + rand() * 0.4;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = startAngle + t * Math.PI * 2 * turns;
    const radius = 0.2 + t * 0.24 + (rand() - 0.5) * 0.1;
    pts.push({
      x: 0.5 + Math.cos(angle) * radius * 1.25,
      y: 0.5 + Math.sin(angle) * radius * squash,
    });
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(0.001, maxX - minX, maxY - minY);
  const scale = 0.88 / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map((p) => ({ x: 0.5 + (p.x - cx) * scale, y: 0.5 + (p.y - cy) * scale }));
}

export function chapterConstellations(chapter: Chapter): Constellation[] {
  return chapter.numbers.map((n) => buildConstellation(chapter.kind, n));
}

export function allConstellations(): Constellation[] {
  return CHAPTERS.flatMap(chapterConstellations);
}

/** Render a fact's left-hand side for display. */
export function factText(f: Fact, withAnswer = false): string {
  const lhs = `${f.a} ${opSymbol(f.op)} ${f.b}`;
  return withAnswer ? `${lhs} = ${f.answer}` : `${lhs} =`;
}

export function factSpoken(f: Fact): string {
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
      return `That's ${f.b} groups of ${f.a}. Try counting in ${f.a}s.`;
    case "div":
      return `How many ${f.b}s fit inside ${f.a}?`;
    default:
      return `Count up in ${f.b}s, ${f.a} times.`;
  }
}
