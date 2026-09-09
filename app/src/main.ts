import "./style.css";
import { generateExercise, isAnswerCorrect, OPERATIONS_BY_GRADE, OPERATION_LABELS, OPERATION_ICONS } from "./engine/generators";
import { applyAnswer, initSkillState } from "./engine/mastery";
import { createProfile, loadProfile, saveProfile, hasFreeLessonRemaining, remainingFreeLessons, FREE_LESSON_CAP } from "./engine/storage";
import type { Exercise, GradeBand, Operation, Profile } from "./engine/types";
import { ACCESSORY_OPTIONS, MASCOT_COLORS, mascotSvg, type Accessory } from "./ui/mascot";
import { burstConfetti } from "./ui/confetti";

const GRADE_LABELS: Record<GradeBand, string> = {
  "K-1": "Kindergarten \u2013 Grade 1",
  "2-3": "Grade 2 \u2013 3",
  "4-5": "Grade 4 \u2013 5",
};

const QUESTIONS_PER_LESSON = 6;

interface AppState {
  screen: "welcome" | "onboarding" | "home" | "exercise" | "summary" | "paywall";
  profile: Profile | null;
  draft: { name: string; gradeBand: GradeBand; color: string; accessory: Accessory };
  currentOperation: Operation | null;
  session: { index: number; correct: number; exercises: Exercise[] } | null;
  lastExercise: Exercise | null;
}

const state: AppState = {
  screen: "welcome",
  profile: loadProfile(),
  draft: { name: "", gradeBand: "K-1", color: MASCOT_COLORS[0], accessory: "none" },
  currentOperation: null,
  session: null,
  lastExercise: null,
};

if (state.profile) state.screen = "home";

const root = document.querySelector<HTMLDivElement>("#app")!;

function render(): void {
  root.innerHTML = "";
  root.appendChild(renderScreen());
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function renderScreen(): HTMLElement {
  switch (state.screen) {
    case "welcome":
      return renderWelcome();
    case "onboarding":
      return renderOnboarding();
    case "home":
      return renderHome();
    case "exercise":
      return renderExercise();
    case "summary":
      return renderSummary();
    case "paywall":
      return renderPaywall();
  }
}

function renderWelcome(): HTMLElement {
  const wrap = el("div", "screen screen-welcome");
  wrap.innerHTML = `
    <div class="welcome-glow"></div>
    <div class="mascot-hero">${mascotSvg(MASCOT_COLORS[0], "none", "happy", 220)}</div>
    <h1 class="brand-title">Number Nest</h1>
    <p class="tagline">A cozy math adventure for curious kids.</p>
    <button class="btn btn-primary btn-lg" id="start-btn">Get started</button>
    <p class="fine-print">No ads. No tracking. A fair free plan, always.</p>
  `;
  wrap.querySelector("#start-btn")!.addEventListener("click", () => {
    state.screen = "onboarding";
    render();
  });
  return wrap;
}

function renderOnboarding(): HTMLElement {
  const wrap = el("div", "screen screen-onboarding");
  const { draft } = state;

  const gradeButtons = (Object.keys(GRADE_LABELS) as GradeBand[])
    .map(
      (g) => `<button class="chip ${draft.gradeBand === g ? "chip-selected" : ""}" data-grade="${g}">${GRADE_LABELS[g]}</button>`
    )
    .join("");

  const colorSwatches = MASCOT_COLORS.map(
    (c) => `<button class="swatch ${draft.color === c ? "swatch-selected" : ""}" data-color="${c}" style="background:${c}"></button>`
  ).join("");

  const accessoryButtons = ACCESSORY_OPTIONS.map(
    (a) => `<button class="chip chip-small ${draft.accessory === a.id ? "chip-selected" : ""}" data-accessory="${a.id}">${a.emoji} ${a.label}</button>`
  ).join("");

  wrap.innerHTML = `
    <h2 class="step-title">Meet your Nubble</h2>
    <div class="mascot-preview" id="mascot-preview">${mascotSvg(draft.color, draft.accessory, "happy", 160)}</div>

    <label class="field-label" for="name-input">What's your name?</label>
    <input id="name-input" class="text-input" placeholder="Your name" value="${draft.name}" maxlength="20" />

    <label class="field-label">Pick your grade</label>
    <div class="chip-row">${gradeButtons}</div>

    <label class="field-label">Pick a color</label>
    <div class="swatch-row">${colorSwatches}</div>

    <label class="field-label">Pick an accessory</label>
    <div class="chip-row">${accessoryButtons}</div>

    <button class="btn btn-primary btn-lg" id="continue-btn" disabled>Let's go!</button>
  `;

  const nameInput = wrap.querySelector<HTMLInputElement>("#name-input")!;
  const continueBtn = wrap.querySelector<HTMLButtonElement>("#continue-btn")!;
  const preview = wrap.querySelector<HTMLDivElement>("#mascot-preview")!;

  function refreshPreview() {
    preview.innerHTML = mascotSvg(draft.color, draft.accessory, "happy", 160);
  }
  function refreshContinue() {
    continueBtn.disabled = draft.name.trim().length === 0;
  }
  refreshContinue();

  nameInput.addEventListener("input", () => {
    draft.name = nameInput.value;
    refreshContinue();
  });

  wrap.querySelectorAll<HTMLButtonElement>("[data-grade]").forEach((btn) =>
    btn.addEventListener("click", () => {
      draft.gradeBand = btn.dataset.grade as GradeBand;
      render();
    })
  );
  wrap.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((btn) =>
    btn.addEventListener("click", () => {
      draft.color = btn.dataset.color!;
      refreshPreview();
      wrap.querySelectorAll(".swatch").forEach((s) => s.classList.remove("swatch-selected"));
      btn.classList.add("swatch-selected");
    })
  );
  wrap.querySelectorAll<HTMLButtonElement>("[data-accessory]").forEach((btn) =>
    btn.addEventListener("click", () => {
      draft.accessory = btn.dataset.accessory as Accessory;
      refreshPreview();
      wrap.querySelectorAll(".chip[data-accessory]").forEach((s) => s.classList.remove("chip-selected"));
      btn.classList.add("chip-selected");
    })
  );

  continueBtn.addEventListener("click", () => {
    state.profile = createProfile(draft.name.trim(), draft.gradeBand, draft.color, draft.accessory);
    saveProfile(state.profile);
    state.screen = "home";
    render();
  });

  return wrap;
}

function renderHome(): HTMLElement {
  const profile = state.profile!;
  const wrap = el("div", "screen screen-home");
  const ops = OPERATIONS_BY_GRADE[profile.gradeBand];

  const skillCards = ops
    .map((op) => {
      const skill = profile.skills[op] ?? initSkillState(op, profile.gradeBand);
      const pct = Math.round((skill.level / 5) * 100);
      const mastered = !!skill.masteredAt;
      return `
      <button class="skill-card" data-op="${op}">
        <div class="skill-icon">${OPERATION_ICONS[op]}</div>
        <div class="skill-info">
          <div class="skill-name">${OPERATION_LABELS[op]}${mastered ? " \u2b50" : ""}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      </button>`;
    })
    .join("");

  wrap.innerHTML = `
    <div class="home-header">
      <div class="mascot-small">${mascotSvg(profile.mascotColor, profile.mascotAccessory as Accessory, "happy", 92)}</div>
      <div>
        <div class="home-greeting">Hi, ${profile.name}!</div>
        <div class="home-sub">${GRADE_LABELS[profile.gradeBand]}</div>
      </div>
      <div class="star-counter">\u2b50 ${profile.stars}</div>
    </div>
    <div class="free-lesson-banner">${remainingFreeLessons(profile)} of ${FREE_LESSON_CAP} free lessons left today</div>
    <h2 class="step-title">Choose a skill</h2>
    <div class="skill-grid">${skillCards}</div>
  `;

  wrap.querySelectorAll<HTMLButtonElement>("[data-op]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const op = btn.dataset.op as Operation;
      if (!hasFreeLessonRemaining(profile)) {
        state.currentOperation = op;
        state.screen = "paywall";
        render();
        return;
      }
      startLesson(op);
    })
  );

  return wrap;
}

function startLesson(op: Operation): void {
  const profile = state.profile!;
  const skill = profile.skills[op] ?? initSkillState(op, profile.gradeBand);
  profile.skills[op] = skill;

  const exercises: Exercise[] = [];
  for (let i = 0; i < QUESTIONS_PER_LESSON; i++) {
    exercises.push(generateExercise(op, profile.gradeBand, skill.level));
  }

  state.currentOperation = op;
  state.session = { index: 0, correct: 0, exercises };
  state.screen = "exercise";
  render();
}

function renderExercise(): HTMLElement {
  const profile = state.profile!;
  const op = state.currentOperation!;
  const session = state.session!;
  const exercise = session.exercises[session.index];

  const wrap = el("div", "screen screen-exercise");
  const pct = Math.round((session.index / session.exercises.length) * 100);

  wrap.innerHTML = `
    <div class="exercise-top">
      <div class="progress-track progress-track-wide"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="question-count">${session.index + 1} / ${session.exercises.length}</div>
    </div>
    <div class="prompt-card" id="prompt-card">
      <div class="prompt-op">${OPERATION_LABELS[op]}</div>
      <div class="prompt-text">${exercise.prompt} = ?</div>
      <input id="answer-input" class="answer-input" inputmode="numeric" autocomplete="off" placeholder="?" />
      <div class="feedback-line" id="feedback-line"></div>
    </div>
    <button class="btn btn-primary btn-lg" id="submit-btn">Check</button>
  `;

  const input = wrap.querySelector<HTMLInputElement>("#answer-input")!;
  const submitBtn = wrap.querySelector<HTMLButtonElement>("#submit-btn")!;
  const feedback = wrap.querySelector<HTMLDivElement>("#feedback-line")!;
  const card = wrap.querySelector<HTMLDivElement>("#prompt-card")!;
  input.focus();

  function submit() {
    const raw = input.value.trim();
    if (raw.length === 0) return;
    const given = Number(raw);
    const correct = !Number.isNaN(given) && isAnswerCorrect(exercise, given);

    const skill = profile.skills[op]!;
    profile.skills[op] = applyAnswer(skill, correct);
    if (correct) {
      session.correct += 1;
      profile.stars += 1;
      feedback.className = "feedback-line feedback-good";
      feedback.textContent = pick(["Great job!", "You've got it!", "Nice work!", "Super!", "Yes! Keep going!"]);
      card.classList.add("card-correct");
      burstConfetti(card);
    } else {
      const shown = exercise.displayAnswer ?? String(exercise.answer);
      feedback.className = "feedback-line feedback-retry";
      feedback.textContent = `Almost! The answer was ${shown}. Let's keep practicing.`;
      card.classList.add("card-retry");
    }
    saveProfile(profile);
    input.disabled = true;
    submitBtn.disabled = true;

    setTimeout(() => {
      session.index += 1;
      if (session.index >= session.exercises.length) {
        profile.lessonsToday += 1;
        saveProfile(profile);
        state.screen = "summary";
      }
      render();
    }, 1100);
  }

  submitBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  return wrap;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderSummary(): HTMLElement {
  const profile = state.profile!;
  const session = state.session!;
  const op = state.currentOperation!;
  const accuracy = Math.round((session.correct / session.exercises.length) * 100);
  const stars = session.correct;
  const skill = profile.skills[op]!;

  const wrap = el("div", "screen screen-summary");
  wrap.innerHTML = `
    <div class="mascot-hero">${mascotSvg(profile.mascotColor, profile.mascotAccessory as Accessory, accuracy >= 60 ? "happy" : "idle", 180)}</div>
    <h2 class="step-title">Lesson complete!</h2>
    <div class="summary-stats">
      <div class="stat"><div class="stat-value">${session.correct}/${session.exercises.length}</div><div class="stat-label">Correct</div></div>
      <div class="stat"><div class="stat-value">${accuracy}%</div><div class="stat-label">Accuracy</div></div>
      <div class="stat"><div class="stat-value">${stars} \u2b50</div><div class="stat-label">Stars earned</div></div>
    </div>
    <div class="mastery-note">${OPERATION_LABELS[op]} level: ${skill.level}/5 ${skill.masteredAt ? "\u2014 Mastered! \u2b50" : ""}</div>
    <button class="btn btn-primary btn-lg" id="home-btn">Back to Nest</button>
  `;
  wrap.querySelector("#home-btn")!.addEventListener("click", () => {
    state.session = null;
    state.screen = "home";
    render();
  });
  return wrap;
}

function renderPaywall(): HTMLElement {
  const wrap = el("div", "screen screen-paywall");
  wrap.innerHTML = `
    <div class="mascot-hero">${mascotSvg(state.profile?.mascotColor ?? MASCOT_COLORS[0], "crown", "idle", 160)}</div>
    <h2 class="step-title">You've used today's free lessons!</h2>
    <p class="paywall-copy">You practiced hard today \u2014 nice work. Come back tomorrow for ${FREE_LESSON_CAP} more free lessons, or unlock unlimited practice with the Family Plan.</p>
    <div class="plan-card">
      <div class="plan-name">Family Plan</div>
      <div class="plan-price">$6.99<span>/month</span></div>
      <ul class="plan-features">
        <li>Unlimited lessons every day</li>
        <li>All grade levels &amp; skills</li>
        <li>Up to 4 kid profiles</li>
        <li>Cancel anytime, right in the app</li>
      </ul>
      <button class="btn btn-primary btn-lg" id="fake-subscribe">Start free trial (demo)</button>
      <button class="btn btn-link" id="manage-sub">Manage subscription</button>
    </div>
    <button class="btn btn-link" id="back-home">Maybe later</button>
    <p class="fine-print">This screen is a UX prototype only \u2014 no real payment is processed. See PLAN.md for the real billing plan.</p>
  `;
  wrap.querySelector("#fake-subscribe")!.addEventListener("click", () => {
    alert("Demo only: real billing integrates StoreKit2 / Play Billing in Phase 1 (see PLAN.md \u00a74).");
  });
  wrap.querySelector("#manage-sub")!.addEventListener("click", () => {
    alert("Demo only: this always deep-links straight to the platform subscription manager in the real app \u2014 no dark patterns.");
  });
  wrap.querySelector("#back-home")!.addEventListener("click", () => {
    state.screen = "home";
    render();
  });
  return wrap;
}

render();
