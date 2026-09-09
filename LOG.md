# Project log / memory

Running log of milestones, learnings, bugs, and opportunities. Newest entries at the bottom.

## 2026-09-08 — Research phase
- Studied the target app ("Math Learner: Learning Game", iOS id1148728253) via App Store listing text, user reviews, and third-party trackers (Sensor Tower, AppAgg, JustUseApp). Publisher is Wildlife Studios (not "Chocolate Apps" as some aggregators claim — flagging that stale/incorrect attributions are common on ASO trackers, worth double-checking any single source).
- Learned the app's real differentiator is the drawn-digit "handwriting recognition" answer input plus a pet/avatar meta-loop — not the exercise content itself, which is standard K-5 arithmetic.
- Found the app's most common 1★ complaints are about an aggressive/early paywall and confusing subscription cancellation — a direct, actionable lesson for our own monetization design (see PLAN.md §4).
- Compared against SplashLearn, Prodigy Math, DragonBox, Todo Math, Monster Math, Photomath, Khan Academy Kids. Key insight: the two apps with $25-35M/yr revenue (SplashLearn, Prodigy) both grew via **school/teacher distribution**, not paid-search/ASO alone — that's a different company motion than what a small team can bootstrap. Math Learner itself, more modestly, appears to sustain roughly high-5-to-low-6-figure annual revenue on iOS alone as a "just" a well-executed paid app — that's the realistic, provable-by-an-MVP target.
- Checked local tooling: no Flutter/Xcode/Android SDK on this Windows dev machine; .NET 10 SDK, Node 24, Python 3.11 are available. Decided MVP will be a TypeScript/Vite web app (buildable today, zero extra SDK installs) designed so the core "engine" (exercise generation, mastery model, content schema) is portable into Capacitor (iOS/Android) and Tauri (Windows) shells later without a rewrite.
- User instruction: MVP must match the reference app's visual/production polish — not a bare-bones prototype. This raises MVP effort (custom illustrated mascot via SVG, animation/juice, kid-friendly type) above what a purely functional prototype would need; budgeted extra design pass accordingly.
- User instruction: if/when native iOS build/test is needed, reuse the existing Mac bridge/credentials already set up for the sibling project at C:\Usr\PB11iPad (see its docs/MAC-SETUP.md and tools/Invoke-Mac.ps1 / mac-remote.sh) rather than provisioning new Mac access. Not needed yet for the web MVP; recorded here so Phase-1 (iOS) work picks it up.
- Created public repo github.com/keyrabbit/math (gh CLI already authenticated as `keyrabbit`, confirmed working from an earlier session's memory: `gh auth switch --user keyrabbit` was NOT needed this time — `keyrabbit` was already the active account).
- Opportunity worth flagging for other projects/tools: Bing/GPT-backed `web_search` conflated "STEAM education market" (science/tech/engineering/arts/math) with "Steam" the Valve gaming platform when asked about Steam-as-a-distribution-channel — had to fall back to general knowledge/reasoning for that specific platform-prioritization call rather than trusting the search result at face value. Worth remembering when using this tool for platform/market-sizing questions with ambiguous acronyms.

## 2026-09-08 — MVP build + polish pass
- Scaffolded `app/` with Vite + vanilla TypeScript (no framework) — chosen over Flutter/.NET MAUI
  because neither SDK was installed on this machine and the task called for something buildable
  and demoable *today*; the engine (`app/src/engine/*`) is written so it can be dropped into a
  Capacitor (iOS/Android) or Tauri (Windows) shell later without a rewrite.
- Built the procedural exercise engine (addition/subtraction/multiplication/division/fractions,
  grade-band + 1-5 difficulty parameterized), a streak-based adaptive mastery tracker, localStorage
  persistence with a daily free-lesson cap, an original SVG mascot ("Nubble") with mastery-unlocked
  (not payment-gated) customization, and a lightweight DOM/CSS confetti effect.
- `npx tsc --noEmit` and `npm run build` both clean on first full pass.
- **Bug found & root-caused during visual QA**: headless-Edge screenshots taken immediately after
  page load showed every color washed out to pale pastel (e.g. the primary purple `#7C4DFF`
  sampled as `rgb(240,243,246)`). Ruled out headless color-profile/dark-mode issues by reproducing
  correct color on a trivial static HTML page in the same browser. Root cause: the `.screen`
  container's `fade-up` CSS animation (opacity 0→1 over 0.45s, `animation-fill-mode: both`) was
  still mid-transition at the instant the screenshot tool captured the frame, uniformly blending
  every element toward the white background. Fixed verification (not the product) by adding
  `--virtual-time-budget=3000` to the headless capture command; colors then matched source exactly.
  **Worth remembering for any future headless visual-regression tooling on this or other
  projects: entrance animations must be allowed to settle (or disabled) before trusting a headless
  screenshot's colors.**
- Built a disposable Puppeteer-core QA harness (`%TEMP%\nn-qa`, not committed) driving real Edge
  against the production `vite preview` build to walk the entire flow end-to-end: onboarding →
  home → 6-question lesson → mastery level-up (Addition went level 1→3 within one session) →
  summary → repeat until the 3/day free-lesson cap → paywall. All screens captured and reviewed;
  final curated set saved to `docs/screenshots/`. This is real evidence the MVP works, not just
  that it compiles.
- Filed 5 GitHub issues for decisions that block real Phase-1 planning: curriculum standard,
  handwriting recognition build-vs-buy, IP/trademark clearance, monetization-model choice (hard
  paywall vs. Prodigy-style free-core), and COPPA/legal-compliance ownership.
- Opportunity/tooling note: `gh repo create ... --source=. --remote=origin` worked cleanly from a
  freshly `git init`'d folder in one step (no separate `gh repo create` + `git remote add`
  dance needed) — worth remembering for future new-repo bootstraps.
- Next milestones (not yet started, tracked as future log entries): none scheduled automatically;
  Phase 1 native work depends on the open decisions above and, per user instruction, would reuse
  the Mac bridge/credentials already configured for the sibling PB11iPad project when iOS
  build/test is actually needed.
