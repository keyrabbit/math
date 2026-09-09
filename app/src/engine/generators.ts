import type { Exercise, GradeBand, Operation } from "./types";

/**
 * Procedural exercise generators. Each (operation, gradeBand, difficulty 1..5) combination
 * produces a huge space of possible problems (not a fixed bank) -- this is how a small engine
 * stands in for "thousands of exercises" without hand-authoring each one.
 */

let counter = 0;
function nextId(): string {
  counter += 1;
  return `ex-${Date.now()}-${counter}`;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/** Range of operands scales with grade band + difficulty (1..5). */
function rangeFor(gradeBand: GradeBand, difficulty: number): { min: number; max: number } {
  const bands: Record<GradeBand, [number, number][]> = {
    "K-1": [
      [1, 5],
      [1, 8],
      [1, 10],
      [1, 12],
      [1, 20],
    ],
    "2-3": [
      [1, 20],
      [1, 50],
      [1, 100],
      [10, 200],
      [10, 500],
    ],
    "4-5": [
      [10, 100],
      [10, 500],
      [10, 1000],
      [100, 5000],
      [100, 10000],
    ],
  };
  const [min, max] = bands[gradeBand][Math.min(4, Math.max(0, difficulty - 1))];
  return { min, max };
}

function genAdd(gradeBand: GradeBand, difficulty: number): Exercise {
  const { min, max } = rangeFor(gradeBand, difficulty);
  const a = randInt(min, max);
  const b = randInt(min, max);
  return {
    id: nextId(),
    operation: "add",
    prompt: `${a} + ${b}`,
    answer: a + b,
    difficulty,
  };
}

function genSub(gradeBand: GradeBand, difficulty: number): Exercise {
  const { min, max } = rangeFor(gradeBand, difficulty);
  let a = randInt(min, max);
  let b = randInt(min, max);
  if (b > a) [a, b] = [b, a]; // keep results non-negative for this age range
  return {
    id: nextId(),
    operation: "sub",
    prompt: `${a} - ${b}`,
    answer: a - b,
    difficulty,
  };
}

function genMul(gradeBand: GradeBand, difficulty: number): Exercise {
  // Multiplication table scales more gently than raw add/sub ranges.
  const tableMax = gradeBand === "K-1" ? 5 : gradeBand === "2-3" ? 10 : 12;
  const factorMax = Math.min(tableMax, 2 + difficulty * 2);
  const a = randInt(2, factorMax);
  const b = randInt(2, factorMax);
  return {
    id: nextId(),
    operation: "mul",
    prompt: `${a} \u00d7 ${b}`,
    answer: a * b,
    difficulty,
  };
}

function genDiv(gradeBand: GradeBand, difficulty: number): Exercise {
  const tableMax = gradeBand === "K-1" ? 5 : gradeBand === "2-3" ? 10 : 12;
  const factorMax = Math.min(tableMax, 2 + difficulty * 2);
  const b = randInt(2, factorMax);
  const quotient = randInt(2, factorMax);
  const a = b * quotient; // guarantees whole-number division, age-appropriate
  return {
    id: nextId(),
    operation: "div",
    prompt: `${a} \u00f7 ${b}`,
    answer: quotient,
    difficulty,
  };
}

const FRACTION_DENOMS_BY_LEVEL = [
  [2, 4],
  [2, 3, 4],
  [2, 3, 4, 5, 6],
  [2, 3, 4, 5, 6, 8, 10],
  [2, 3, 4, 5, 6, 8, 10, 12],
];

function genFraction(_gradeBand: GradeBand, difficulty: number): Exercise {
  // "Which fraction is shaded / equivalent to?" style: add two fractions with matching or related denominators.
  const denoms = FRACTION_DENOMS_BY_LEVEL[Math.min(4, Math.max(0, difficulty - 1))];
  const den = pick(denoms);
  const num1 = randInt(1, den - 1);
  const num2 = randInt(1, den - num1); // keep sum <= 1 whole for young learners
  const answer = (num1 + num2) / den;
  return {
    id: nextId(),
    operation: "fraction",
    prompt: `${num1}/${den} + ${num2}/${den}`,
    answer,
    displayAnswer: `${num1 + num2}/${den}`,
    difficulty,
  };
}

const GENERATORS: Record<Operation, (g: GradeBand, d: number) => Exercise> = {
  add: genAdd,
  sub: genSub,
  mul: genMul,
  div: genDiv,
  fraction: genFraction,
};

/** Operations unlocked per grade band, in progression order (mirrors the reference app's skill-tree gating). */
export const OPERATIONS_BY_GRADE: Record<GradeBand, Operation[]> = {
  "K-1": ["add", "sub"],
  "2-3": ["add", "sub", "mul", "div"],
  "4-5": ["add", "sub", "mul", "div", "fraction"],
};

export function generateExercise(operation: Operation, gradeBand: GradeBand, difficulty: number): Exercise {
  return GENERATORS[operation](gradeBand, Math.min(5, Math.max(1, Math.round(difficulty))));
}

export function isAnswerCorrect(exercise: Exercise, given: number): boolean {
  return Math.abs(given - exercise.answer) < 1e-9;
}

export const OPERATION_LABELS: Record<Operation, string> = {
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
  fraction: "Fractions",
};

export const OPERATION_ICONS: Record<Operation, string> = {
  add: "+",
  sub: "\u2212",
  mul: "\u00d7",
  div: "\u00f7",
  fraction: "\u00bd",
};
