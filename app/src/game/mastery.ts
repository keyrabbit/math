import type { Constellation, Fact } from "./curriculum";

/**
 * Mastery model — spaced repetition, made visible.
 *
 * The naive design ("a fact is mastered once you get it right") teaches nothing durable. The
 * strict design ("a fact only counts after surviving a day-scale review") is honest but produces a
 * catastrophic first session: a child answers eight questions perfectly and is told *zero stars
 * lit*. Both are wrong.
 *
 * So the schedule is expressed as **starlight**:
 *
 *   - A correct answer **lights the star immediately.** The reward is never deferred.
 *   - Each star then **holds** its light for an interval that grows with every successful review
 *     (2 minutes → 10 → 1 hour → 1 day → 3 days → 1 week → 3 weeks).
 *   - When the hold expires the star begins to **fade** — visibly dimmer, and surfaced as "fading"
 *     in the UI. It never goes out completely; earned work is never erased.
 *   - Relighting a faded star pushes it into the next, longer interval.
 *   - After surviving the longest interval a star is **sealed**: permanently bright, retired from
 *     review.
 *
 * That is a textbook expanding-interval schedule (a simplified SM-2) that a five-year-old can read
 * off the screen without being taught what a schedule is.
 */

export interface FactState {
  /** Interval index. 0 = never answered correctly. */
  box: number;
  /** Consecutive correct answers. */
  streak: number;
  seen: number;
  correct: number;
  /** Epoch ms when this star's light starts to fade. */
  holdsUntil: number;
  /** Fastest correct response, ms — the fluency signal. */
  bestMs: number;
  /** Rolling mean response time, ms. */
  avgMs: number;
  lastSeen: number;
}

/**
 * Hold durations in minutes, indexed by box. Box 0 is "unlit".
 * The first two are deliberately short so a child sees the fade-and-relight mechanic within a
 * single sitting rather than having to take it on trust.
 */
const HOLD_MINUTES = [0, 2, 10, 60, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 21];

/** Reaching this box seals the star permanently. */
export const SEALED_BOX = HOLD_MINUTES.length - 1;

/** How long a star takes to fade from full to its floor once the hold expires. */
const FADE_MINUTES = 60 * 24;

/** Faded stars never drop below this brightness — earned work is never erased. */
const FADE_FLOOR = 0.3;

/** Under this response time a correct answer counts as recall rather than computation. */
export const FLUENT_MS = 3500;

export function emptyFactState(): FactState {
  return { box: 0, streak: 0, seen: 0, correct: 0, holdsUntil: 0, bestMs: 0, avgMs: 0, lastSeen: 0 };
}

export interface ConstellationProgress {
  /** Facts with any light at all. */
  lit: number;
  /** Facts sealed permanently. */
  sealed: number;
  /** Facts currently fading and worth revisiting. */
  fading: number;
  total: number;
  ratio: number;
  /** Every star lit — the constellation is drawn. */
  complete: boolean;
  /** Every star sealed — the constellation is permanent. */
  isSealed: boolean;
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
      // Promote on any correct answer, but a slow answer only earns a short hold: fluency and
      // accuracy are different skills and the schedule should reflect that.
      const slow = responseMs > FLUENT_MS && s.box >= 2;
      s.box = slow ? s.box : Math.min(s.box + 1, SEALED_BOX);
      s.holdsUntil = now + HOLD_MINUTES[s.box] * 60_000;
    } else {
      s.streak = 0;
      // Drop one box, never below 1 once lit — a miss dims a star, it does not put it out.
      s.box = s.box === 0 ? 0 : Math.max(1, s.box - 1);
      s.holdsUntil = now + HOLD_MINUTES[s.box] * 60_000;
    }
    return s;
  }

  /** Has this star ever been lit? */
  isLit(id: string): boolean {
    return this.get(id).box >= 1;
  }

  isSealed(id: string): boolean {
    return this.get(id).box >= SEALED_BOX;
  }

  /**
   * Current brightness of a star, 0..1. This is what the renderer draws, so the spaced-repetition
   * schedule is literally visible in the sky.
   */
  brightness(id: string, now = Date.now()): number {
    const s = this.facts.get(id);
    if (!s || s.box < 1) return 0;
    if (s.box >= SEALED_BOX) return 1;
    if (now <= s.holdsUntil) return 1;
    const overdueMinutes = (now - s.holdsUntil) / 60_000;
    const fade = Math.min(1, overdueMinutes / FADE_MINUTES);
    return 1 - fade * (1 - FADE_FLOOR);
  }

  isFading(id: string, now = Date.now()): boolean {
    const s = this.facts.get(id);
    return !!s && s.box >= 1 && s.box < SEALED_BOX && now > s.holdsUntil;
  }

  /** Never-seen or actively wrong — the facts the child still has to learn. */
  isUnlearned(id: string): boolean {
    return this.get(id).box === 0;
  }

  progress(c: Constellation, now = Date.now()): ConstellationProgress {
    const total = c.facts.length;
    let lit = 0;
    let sealed = 0;
    let fading = 0;
    for (const f of c.facts) {
      if (this.isLit(f.id)) lit += 1;
      if (this.isSealed(f.id)) sealed += 1;
      if (this.isFading(f.id, now)) fading += 1;
    }
    return {
      lit,
      sealed,
      fading,
      total,
      ratio: total === 0 ? 0 : lit / total,
      complete: lit === total && total > 0,
      isSealed: sealed === total && total > 0,
    };
  }

  /**
   * Choose the next fact to present.
   *
   * Priority:
   *  1. a star that is fading (review is due — this is the whole point of the schedule)
   *  2. the next unlearned fact, in teaching order (so the ladder's pattern stays visible)
   *  3. the least-recently-seen lit fact
   *
   * Interleaving overdue review with new material is what makes practice stick; blocked practice
   * feels easier during the session and works worse afterwards.
   */
  nextFact(c: Constellation, now = Date.now(), avoid?: string): Fact | null {
    const pool = c.facts.filter((f) => f.id !== avoid);
    const candidates = pool.length > 0 ? pool : c.facts;
    if (candidates.length === 0) return null;

    const fading = candidates
      .filter((f) => this.isFading(f.id, now))
      .sort((a, b) => this.get(a.id).holdsUntil - this.get(b.id).holdsUntil);
    if (fading.length > 0) return fading[0];

    const unlearned = candidates.filter((f) => this.isUnlearned(f.id));
    if (unlearned.length > 0) return unlearned[0];

    return candidates
      .slice()
      .sort((a, b) => this.get(a.id).lastSeen - this.get(b.id).lastSeen)[0];
  }

  /** Overall figures for the parent report. */
  summary(now = Date.now()): {
    attempted: number;
    lit: number;
    sealed: number;
    fading: number;
    accuracy: number;
    fluent: number;
  } {
    let attempted = 0;
    let lit = 0;
    let sealed = 0;
    let fading = 0;
    let correct = 0;
    let seen = 0;
    let fluent = 0;
    for (const [id, s] of this.facts.entries()) {
      if (s.seen > 0) attempted += 1;
      if (s.box >= 1) lit += 1;
      if (s.box >= SEALED_BOX) sealed += 1;
      if (this.isFading(id, now)) fading += 1;
      if (s.bestMs > 0 && s.bestMs <= FLUENT_MS) fluent += 1;
      correct += s.correct;
      seen += s.seen;
    }
    return { attempted, lit, sealed, fading, accuracy: seen === 0 ? 0 : correct / seen, fluent };
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
