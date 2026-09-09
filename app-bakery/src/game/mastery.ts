import type { Recipe, Fact } from "./curriculum";

/**
 * Mastery model — spaced repetition, made visible.
 *
 * The naive design ("a fact is mastered once you get it right") teaches nothing durable. The
 * strict design ("a fact only counts after surviving a day-scale review") is honest but produces a
 * catastrophic first session: a child answers eight questions perfectly and is told *nothing was
 * baked*. Both are wrong.
 *
 * So the schedule is expressed as **freshness** — the one property of baked goods every child
 * already understands:
 *
 *   - A correct answer **bakes the treat immediately.** The reward is never deferred.
 *   - Each treat then **stays fresh** for an interval that grows with every successful review
 *     (2 minutes → 10 → 1 hour → 1 day → 3 days → 1 week → 3 weeks).
 *   - When the freshness runs out the treat starts to **go stale** — visibly duller, and surfaced
 *     as "going stale" in the UI. It never vanishes; work the child did is never taken away.
 *   - Baking a stale treat again pushes it into the next, longer interval.
 *   - After surviving the longest interval a treat becomes a **house special**: permanently fresh,
 *     retired from review.
 *
 * That is a textbook expanding-interval schedule (a simplified SM-2) that a five-year-old can read
 * off the screen without ever being taught what a schedule is. "This one's going stale, shall we
 * bake it again?" is a sentence that needs no explanation.
 */

export interface FactState {
  /** Interval index. 0 = never answered correctly. */
  box: number;
  /** Consecutive correct answers. */
  streak: number;
  seen: number;
  correct: number;
  /** Epoch ms when this treat starts to go stale. */
  holdsUntil: number;
  /** Fastest correct response, ms — the fluency signal. */
  bestMs: number;
  /** Rolling mean response time, ms. */
  avgMs: number;
  lastSeen: number;
}

/**
 * Freshness durations in minutes, indexed by box. Box 0 is "not baked".
 * The first two are deliberately short so a child sees the stale-and-rebake mechanic within a
 * single sitting rather than having to take it on trust.
 */
const HOLD_MINUTES = [0, 2, 10, 60, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 21];

/** Reaching this box makes a treat a house special, permanently. */
export const SPECIAL_BOX = HOLD_MINUTES.length - 1;

/**
 * How long a treat takes to go from fresh down to its floor once its freshness runs out,
 * expressed as a **multiple of the hold it just lapsed** rather than a fixed duration.
 *
 * This was originally a flat 24 hours, which quietly defeated the comment above. A box-1 treat
 * holds for two minutes — deliberately short so the child sees the mechanic inside one sitting —
 * but a 24-hour ramp meant that one minute after going stale it was still drawn at 99.95%
 * freshness, and half an hour later at 98.5%. The tutorial beat therefore said "look, that one's
 * gone a bit stale" while pointing at a treat indistinguishable from a fresh one. Scaling the ramp
 * to the interval keeps "stale" legible at every point on the schedule.
 */
const STALE_RAMP = 1.5;

/** Floor and ceiling on that ramp: fast enough to see in a sitting, slow enough not to alarm. */
const STALE_RAMP_MIN_MINUTES = 3;
const STALE_RAMP_MAX_MINUTES = 60 * 24 * 3;

/** Stale treats never drop below this. Work the child did is never erased. */
const STALE_FLOOR = 0.3;

/** Under this response time a correct answer counts as recall rather than computation. */
export const FLUENT_MS = 3500;

export function emptyFactState(): FactState {
  return { box: 0, streak: 0, seen: 0, correct: 0, holdsUntil: 0, bestMs: 0, avgMs: 0, lastSeen: 0 };
}

export interface RecipeProgress {
  /** Treats baked at all. */
  baked: number;
  /** Treats that have become house specials. */
  special: number;
  /** Treats going stale and worth baking again. */
  stale: number;
  total: number;
  ratio: number;
  /** Every treat baked — the shelf is full. */
  complete: boolean;
  /** Every treat a house special — the recipe is finished for good. */
  allSpecial: boolean;
}

export class Mastery {
  private facts = new Map<string, FactState>();

  constructor(serialized?: Record<string, FactState>) {
    if (serialized) {
      for (const [k, v] of Object.entries(serialized)) {
        this.facts.set(k, { ...emptyFactState(), ...v });
      }
    }
  }

  get(id: string): FactState {
    let s = this.facts.get(id);
    if (!s) {
      s = emptyFactState();
      this.facts.set(id, s);
    }
    return s;
  }

  has(id: string): boolean {
    return this.facts.has(id);
  }

  record(id: string, correct: boolean, responseMs: number, now = Date.now()): FactState {
    const s = this.get(id);
    s.seen += 1;
    s.lastSeen = now;
    if (correct) {
      s.correct += 1;
      s.streak += 1;
      s.bestMs = s.bestMs === 0 ? responseMs : Math.min(s.bestMs, responseMs);
      s.avgMs = s.avgMs === 0 ? responseMs : s.avgMs * 0.7 + responseMs * 0.3;
      // Promote on any correct answer, but a slow answer only earns a short freshness: fluency and
      // accuracy are different skills and the schedule should reflect that.
      const slow = responseMs > FLUENT_MS && s.box >= 2;
      s.box = slow ? s.box : Math.min(s.box + 1, SPECIAL_BOX);
      s.holdsUntil = now + HOLD_MINUTES[s.box] * 60_000;
    } else {
      s.streak = 0;
      // Drop one box, never below 1 once baked — a miss makes a treat go stale sooner, it never
      // takes the treat off the shelf.
      s.box = s.box === 0 ? 0 : Math.max(1, s.box - 1);
      s.holdsUntil = now + HOLD_MINUTES[s.box] * 60_000;
    }
    return s;
  }

  /** Has this treat ever been baked? */
  isBaked(id: string): boolean {
    return this.get(id).box >= 1;
  }

  isSpecial(id: string): boolean {
    return this.get(id).box >= SPECIAL_BOX;
  }

  /**
   * Current freshness of a treat, 0..1. This is what the renderer draws, so the spaced-repetition
   * schedule is literally visible in the display case.
   */
  freshness(id: string, now = Date.now()): number {
    const s = this.facts.get(id);
    if (!s || s.box < 1) return 0;
    if (s.box >= SPECIAL_BOX) return 1;
    if (now <= s.holdsUntil) return 1;
    const overdueMinutes = (now - s.holdsUntil) / 60_000;
    const rampMinutes = Math.min(
      STALE_RAMP_MAX_MINUTES,
      Math.max(STALE_RAMP_MIN_MINUTES, HOLD_MINUTES[s.box] * STALE_RAMP)
    );
    const staleness = Math.min(1, overdueMinutes / rampMinutes);
    return 1 - staleness * (1 - STALE_FLOOR);
  }

  isStale(id: string, now = Date.now()): boolean {
    const s = this.facts.get(id);
    return !!s && s.box >= 1 && s.box < SPECIAL_BOX && now > s.holdsUntil;
  }

  /** Never-seen or actively wrong — the facts the child still has to learn. */
  isUnlearned(id: string): boolean {
    return this.get(id).box === 0;
  }

  progress(r: Recipe, now = Date.now()): RecipeProgress {
    const total = r.facts.length;
    let baked = 0;
    let special = 0;
    let stale = 0;
    for (const f of r.facts) {
      if (this.isBaked(f.id)) baked += 1;
      if (this.isSpecial(f.id)) special += 1;
      if (this.isStale(f.id, now)) stale += 1;
    }
    return {
      baked,
      special,
      stale,
      total,
      ratio: total === 0 ? 0 : baked / total,
      complete: baked === total && total > 0,
      allSpecial: special === total && total > 0,
    };
  }

  /**
   * Choose the next fact to present.
   *
   * Priority:
   *  1. a treat going stale (review is due — this is the whole point of the schedule)
   *  2. the next unlearned fact, in teaching order (so the recipe's pattern stays visible)
   *  3. the least-recently-seen baked fact
   *
   * Interleaving overdue review with new material is what makes practice stick; blocked practice
   * feels easier during the session and works worse afterwards.
   */
  nextFact(r: Recipe, now = Date.now(), avoid?: string): Fact | null {
    const pool = r.facts.filter((f) => f.id !== avoid);
    const candidates = pool.length > 0 ? pool : r.facts;
    if (candidates.length === 0) return null;

    const stale = candidates
      .filter((f) => this.isStale(f.id, now))
      .sort((a, b) => this.get(a.id).holdsUntil - this.get(b.id).holdsUntil);
    if (stale.length > 0) return stale[0];

    const unlearned = candidates.filter((f) => this.isUnlearned(f.id));
    if (unlearned.length > 0) return unlearned[0];

    return candidates
      .slice()
      .sort((a, b) => this.get(a.id).lastSeen - this.get(b.id).lastSeen)[0];
  }

  /** Overall figures for the parent report. */
  summary(now = Date.now()): {
    attempted: number;
    baked: number;
    special: number;
    stale: number;
    accuracy: number;
    fluent: number;
  } {
    let attempted = 0;
    let baked = 0;
    let special = 0;
    let stale = 0;
    let correct = 0;
    let seen = 0;
    let fluent = 0;
    for (const [id, s] of this.facts.entries()) {
      if (s.seen > 0) attempted += 1;
      if (s.box >= 1) baked += 1;
      if (s.box >= SPECIAL_BOX) special += 1;
      if (this.isStale(id, now)) stale += 1;
      if (s.bestMs > 0 && s.bestMs <= FLUENT_MS) fluent += 1;
      correct += s.correct;
      seen += s.seen;
    }
    return { attempted, baked, special, stale, accuracy: seen === 0 ? 0 : correct / seen, fluent };
  }

  /** The actionable half of the parent report. */
  strugglingFacts(limit = 5): { id: string; accuracy: number; seen: number }[] {
    return [...this.facts.entries()]
      .filter(([, s]) => s.seen >= 3 && s.correct / s.seen < 0.7)
      .map(([id, s]) => ({ id, accuracy: s.correct / s.seen, seen: s.seen }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  }

  toJSON(): Record<string, FactState> {
    const out: Record<string, FactState> = {};
    for (const [k, v] of this.facts.entries()) out[k] = v;
    return out;
  }
}
