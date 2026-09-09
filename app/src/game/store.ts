import { Mastery, type FactState } from "./mastery";

const KEY = "pipkin.save.v1";

export interface Settings {
  muted: boolean;
  reducedMotion: boolean | null; // null = follow the OS
  /** Parent-set daily play limit in minutes. 0 = unlimited. */
  dailyLimitMinutes: number;
}

export interface SaveData {
  version: 1;
  name: string;
  ageBand: "5-6" | "7-8" | "9-11";
  createdAt: number;
  pips: number;
  chapter: number;
  /** Highest chapter unlocked. */
  unlockedChapter: number;
  /** Constellation keys the player has completed. */
  completed: string[];
  streakDays: number;
  lastPlayedDay: string;
  /** Cumulative seconds played, per ISO day — feeds the parent report and the daily limit. */
  playSeconds: Record<string, number>;
  settings: Settings;
  mastery: Record<string, FactState>;
  onboarded: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    name: "",
    ageBand: "7-8",
    createdAt: Date.now(),
    pips: 0,
    chapter: 0,
    unlockedChapter: 0,
    completed: [],
    streakDays: 0,
    lastPlayedDay: "",
    playSeconds: {},
    settings: { muted: false, reducedMotion: null, dailyLimitMinutes: 0 },
    mastery: {},
    onboarded: false,
  };
}

/**
 * Save/profile store.
 *
 * Local-only by design. No account, no email, no analytics on a child's device — that is both the
 * right default for a product used by five-year-olds and the cheapest possible path through
 * COPPA/GDPR-K compliance. Cloud sync, if ever added, belongs behind a parent gate and must be
 * opt-in. (See repo issue on COPPA/legal.)
 */
class Store {
  private data: SaveData = defaultSave();
  mastery = new Mastery();
  private saveTimer: number | null = null;
  private sessionStart = Date.now();

  load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        this.data = { ...defaultSave(), ...parsed, settings: { ...defaultSave().settings, ...parsed.settings } };
      }
    } catch {
      // Corrupt or unavailable storage must never block play; fall back to a fresh profile.
      this.data = defaultSave();
    }
    this.mastery = new Mastery(this.data.mastery);
    this.touchDailyStreak();
    return this.data;
  }

  get state(): SaveData {
    return this.data;
  }

  /** Debounced write — called freely from gameplay without hammering localStorage. */
  save(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 400);
  }

  flush(): void {
    this.data.mastery = this.mastery.toJSON();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked (private mode) — gameplay continues in memory */
    }
  }

  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  addPips(n: number): number {
    this.data.pips += n;
    this.save();
    return this.data.pips;
  }

  markCompleted(key: string): boolean {
    if (this.data.completed.includes(key)) return false;
    this.data.completed.push(key);
    this.save();
    return true;
  }

  /** Called on load: maintains a day streak without punishing a single missed day too harshly. */
  private touchDailyStreak(): void {
    const t = today();
    if (this.data.lastPlayedDay === t) return;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    this.data.streakDays = this.data.lastPlayedDay === yesterday ? this.data.streakDays + 1 : 1;
    this.data.lastPlayedDay = t;
    this.save();
  }

  /** Accumulate playtime for the parent report and any parent-set daily limit. */
  recordPlaytime(): void {
    const t = today();
    const seconds = Math.round((Date.now() - this.sessionStart) / 1000);
    this.sessionStart = Date.now();
    this.data.playSeconds[t] = (this.data.playSeconds[t] ?? 0) + seconds;
    this.save();
  }

  minutesPlayedToday(): number {
    return Math.round((this.data.playSeconds[today()] ?? 0) / 60);
  }

  reset(): void {
    this.data = defaultSave();
    this.mastery = new Mastery();
    this.flush();
  }
}

export const store = new Store();
