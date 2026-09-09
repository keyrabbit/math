import type { GradeBand, Operation, SkillState } from "./types";

/**
 * Minimal adaptive-difficulty / mastery heuristic (v1, per PLAN.md -- to be replaced by a
 * proper Bayesian Knowledge Tracing / spaced-repetition model pre-launch).
 *
 * Rules:
 * - 3 correct in a row -> level up (max 5).
 * - 2 wrong in a row -> level down (min 1).
 * - Sustaining level 5 with streak >= 5 marks the skill "mastered" (timestamped once).
 * - Rolling accuracy is an exponential moving average, used for the progress ring in the UI.
 */

export function initSkillState(operation: Operation, gradeBand: GradeBand): SkillState {
  return {
    operation,
    gradeBand,
    accuracy: 0,
    level: 1,
    streak: 0,
    attempts: 0,
  };
}

const EMA_ALPHA = 0.25;

export function applyAnswer(state: SkillState, wasCorrect: boolean): SkillState {
  const next: SkillState = { ...state };
  next.attempts += 1;
  next.accuracy = next.attempts === 1 ? (wasCorrect ? 1 : 0) : state.accuracy * (1 - EMA_ALPHA) + (wasCorrect ? 1 : 0) * EMA_ALPHA;

  if (wasCorrect) {
    next.streak = state.streak >= 0 ? state.streak + 1 : 1;
  } else {
    next.streak = state.streak <= 0 ? state.streak - 1 : -1;
  }

  if (next.streak >= 3 && next.level < 5) {
    next.level += 1;
    next.streak = 0;
  } else if (next.streak <= -2 && next.level > 1) {
    next.level -= 1;
    next.streak = 0;
  }

  if (next.level === 5 && wasCorrect && next.streak >= 5 && !next.masteredAt) {
    next.masteredAt = Date.now();
  }

  return next;
}
