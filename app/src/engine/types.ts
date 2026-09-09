export type GradeBand = "K-1" | "2-3" | "4-5";

export type Operation = "add" | "sub" | "mul" | "div" | "fraction";

export interface Exercise {
  id: string;
  operation: Operation;
  prompt: string;
  /** Correct numeric answer. For fractions this is a decimal value compared with tolerance. */
  answer: number;
  /** Optional human-readable correct answer for display (e.g. "3/4"). */
  displayAnswer?: string;
  difficulty: number; // 1..5, used by the mastery tracker
}

export interface SkillState {
  operation: Operation;
  gradeBand: GradeBand;
  /** rolling accuracy 0..1 */
  accuracy: number;
  /** current difficulty level 1..5, adapts up/down */
  level: number;
  streak: number;
  attempts: number;
  masteredAt?: number; // epoch ms once level 5 sustained
}

export interface SessionResult {
  totalAttempted: number;
  totalCorrect: number;
  starsEarned: number;
  operation: Operation;
}

export interface Profile {
  name: string;
  gradeBand: GradeBand;
  mascotColor: string;
  mascotAccessory: string;
  stars: number;
  lessonsToday: number;
  lastLessonDay: string; // yyyy-mm-dd, used for the daily free-lesson cap
  skills: Record<string, SkillState>;
}
