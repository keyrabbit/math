/**
 * What sprinkles are *for*.
 *
 * Sprinkles were a currency with nothing to buy: a ten-minute session earned 378 of them and the
 * number did nothing but climb. Children work that out fast, and a counter that means nothing
 * teaches them that the rest of the screen might mean nothing too.
 *
 * There is deliberately no shop. A shop needs a browsing screen, a confirm step and a regret
 * mechanic, and none of those belong in a five-year-old's maths game — the reference app's own
 * worst reviews are about exactly that kind of interruption. Instead Crumb spends the sprinkles
 * himself, on the bakery, in a fixed order the child can see coming. The counter becomes a
 * countdown to a named thing ("62 more until the bunting"), which is the part that actually
 * creates anticipation, and the reward arrives as a decoration in the case that never goes away.
 */

export interface Decor {
  id: string;
  name: string;
  /** Total lifetime sprinkles required. */
  cost: number;
  /** What Crumb says when he puts it up. */
  line: string;
}

/**
 * Costs rise but never stall.
 *
 * A correct answer is worth 2-6 sprinkles, so an eight-question lesson pays roughly 30. The first
 * decoration therefore lands inside the first session — a child must see the mechanic pay out
 * before they will believe in it — and the last is roughly a full run of the game away.
 */
export const DECOR: Decor[] = [
  { id: "bunting", name: "Paper bunting", cost: 60, line: "Crumb strung bunting over the window." },
  { id: "lamp", name: "Little brass lamp", cost: 160, line: "A warm lamp for the dark mornings." },
  { id: "cat", name: "Bakery cat", cost: 320, line: "A cat wandered in and stayed." },
  { id: "clock", name: "Cuckoo clock", cost: 540, line: "It is always almost opening time." },
  { id: "radio", name: "Kitchen radio", cost: 820, line: "Crumb hums along, mostly wrong." },
  { id: "awning", name: "Striped awning", cost: 1180, line: "Now the queue can wait in the shade." },
  { id: "oven", name: "Big copper oven", cost: 1640, line: "Six trays at once. Six!" },
  { id: "sign", name: "Gold shop sign", cost: 2200, line: "CRUMB'S BAKERY, in real gold leaf." },
];

export function unlockedDecor(sprinkles: number): Decor[] {
  return DECOR.filter((d) => sprinkles >= d.cost);
}

/** The next thing Crumb is saving up for, or null once the bakery is finished. */
export function nextDecor(sprinkles: number): { decor: Decor; remaining: number; fill: number } | null {
  const index = DECOR.findIndex((d) => sprinkles < d.cost);
  if (index < 0) return null;
  const decor = DECOR[index];
  const floor = index === 0 ? 0 : DECOR[index - 1].cost;
  const span = decor.cost - floor;
  return {
    decor,
    remaining: decor.cost - sprinkles,
    fill: span <= 0 ? 1 : Math.max(0, Math.min(1, (sprinkles - floor) / span)),
  };
}

/** Decorations crossed between two sprinkle totals — i.e. earned during one lesson. */
export function decorEarnedBetween(before: number, after: number): Decor[] {
  return DECOR.filter((d) => d.cost > before && d.cost <= after);
}
