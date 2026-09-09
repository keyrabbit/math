# Number Nest — MVP

A polished, ad-free web prototype of a K-5 math learning game, built to validate the core
loop, content-generation engine, and a fairer monetization pattern before committing to native
iOS/Android/Windows builds. See `../RESEARCH.md` and `../PLAN.md` for the full context.

## Run it

```powershell
npm install
npm run dev       # http://localhost:5173
npm run build     # type-checks + production build to dist/
npm run preview   # serve the production build locally
```

## What's implemented
- Onboarding: name, grade band (K-1 / 2-3 / 4-5), mascot color + accessory picker.
- Procedural exercise engine (`src/engine/generators.ts`) for addition, subtraction,
  multiplication, division, and fractions, parameterized by grade band and a 1-5 difficulty level
  — effectively unlimited unique problems rather than a fixed bank.
- Adaptive difficulty / mastery tracker (`src/engine/mastery.ts`): streak-based level up/down,
  rolling accuracy, "mastered" flag.
- Local, offline persistence via `localStorage` (`src/engine/storage.ts`) — no account needed.
- A generous, honest free tier (3 lessons/day) and a mocked paywall (`src/main.ts`
  `renderPaywall`) that never blocks a lesson already in progress and always shows a real
  "manage subscription" affordance — a deliberate contrast to the reference app's most-criticized
  pattern (see `RESEARCH.md` §1/§4).
- An original SVG mascot ("Nubble", `src/ui/mascot.ts`) with color + accessory customization,
  unlocked by playing, not by paying.
- Warm, growth-mindset feedback copy and a lightweight CSS/DOM confetti burst on correct answers
  (`src/ui/confetti.ts`) — no canvas or external animation library needed.

## What's intentionally NOT in the MVP
Handwriting/digit recognition, real payment processing, native shells (iOS/Android/Windows),
multi-language content, and a backend/sync layer are all deferred — see `PLAN.md` §3-4 for the
costed reasoning behind each.

## QA notes
The whole flow (onboarding → home → exercise → summary → paywall) was exercised end-to-end with a
scripted Puppeteer pass driving a real Chromium build against the production `vite preview`
server; screenshots are in `../docs/screenshots/`. One real bug was caught and fixed during this
pass: the screen fade-in CSS animation could race a headless screenshot tool if captured before
the animation settled, making colors look washed out — not a product bug, but worth knowing if you
automate visual regression testing against this codebase (allow the `.screen` fade-up animation,
~450ms, to complete before asserting on rendered colors).
