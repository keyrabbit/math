# Plan: build a polished, cross-platform K-5 math learning game

Goal: match "Math Learner"'s category (grade-aware math drills wrapped in a game/avatar/pet loop) with **better ethics** (fair paywall, no dark patterns, kind feedback) and comparable or better production polish, then ship where the revenue evidence says to ship.

## 0. Product name & IP
Working title: **"Number Nest"** (kids nurture a pet/nest that grows as they master math — deliberately distinct mascot/IP from Math Learner's dog and from Prodigy's RPG wizard to avoid IP overlap). Bundle id placeholder: `com.keyrabbit.numbernest`.

## 1. Platform rollout order (from RESEARCH.md §3)
| Phase | Platform | Why | Target |
|---|---|---|---|
| MVP (this repo, now) | **Web build** (runs in any browser incl. Windows) | Fastest way to prove the core loop/engine/content-generation/polish with zero SDK friction on this dev machine; same TypeScript engine reused by every later platform | Weeks 0 |
| Phase 1 | **iOS (iPhone+iPad)** | #1 revenue priority per research | Wrap engine via Capacitor → native iOS shell, Kids Category submission |
| Phase 2 | **Android (Google Play)** | #2 priority, reach | Same Capacitor shell → Android, Play Families Policy submission |
| Phase 3 | **Windows (Microsoft Store)** | Cheap byproduct via Tauri/MSIX packaging of the same web build; companion/reach play, not a revenue driver | MSIX + Store listing |
| Phase 4 (optional) | **Steam** | Lowest priority; only if Windows build gains traction with homeschool families; near-zero incremental cost via Steamworks wrap | Opportunistic |

Rationale recap: iOS has the only proven direct comparable revenue in this exact niche; Android adds reach at lower ARPU; Windows Store and Steam have no evidence of meaningful kids-edu revenue and are treated as low-cost distribution add-ons once the core product exists, never as the reason to add features.

## 2. Why one shared engine, many shells
All four targets ship the **same TypeScript "learning engine"** (exercise generators, mastery/adaptive-difficulty model, progress store, content schema) behind platform-specific shells:
- Web/MVP: Vite + TypeScript + Canvas/DOM, runs today, no SDK needed.
- iOS/Android: Capacitor wraps the same web build as a native app, adds native IAP/subscriptions, handwriting input via native plugin, Family Sharing.
- Windows: Tauri (Rust shell) or WebView2 packaging of the same web build → MSIX for Microsoft Store.
- Steam: same Windows build, wrapped with Steamworks SDK only if Phase 4 is greenlit.

This keeps content/pedagogy investment (the actual hard, valuable part) platform-agnostic, and isolates the truly platform-specific cost (native IAP, handwriting SDK, store compliance) to thin shells.

## 3. MVP scope (built in this repo, `/app`)
A visually polished, playable single-player web prototype that already demonstrates the full core loop, matching the visual/interaction quality bar of the reference app:
- **Onboarding**: pick a grade band (K-1, 2-3, 4-5) → deliberately mirrors the original's grade-select onboarding.
- **Home/hub**: a companion creature ("Nubble") that levels up and can be customized (color + accessory) with unlocks tied to mastery, not to payment — this is our answer to Math Learner's pet/avatar loop, but reward-for-learning rather than paywall-gated cosmetics.
- **Exercise engine**: procedural generators for addition, subtraction, multiplication, division, and fractions, parameterized by grade band and an adaptive difficulty/mastery tracker (correct-streak + response-time based), so it behaves like "thousands of exercises" rather than a fixed bank.
- **Answer input**: on-screen keypad + drag/tap builder for fractions — deliberately avoids the reviewed "handwriting rejects correct input" failure mode; free-form digit entry validated against the actual numeric answer (not string-exact), with partial-entry tolerance.
- **Feedback**: warm, growth-mindset microcopy, animated confetti/particle celebration, encouraging retry copy on misses (never negative/shaming copy — directly fixes the #1 named competitor complaint).
- **Progress**: session summary (stars, streak, accuracy), local persistence (localStorage) — no account/login required for MVP.
- **Monetization UI (stub only, not wired to real billing)**: a fair "3 free lessons/day, then Family Plan" paywall screen shown honestly *after* real usage, with a visible mocked "manage subscription" link — proves out the fairer monetization pattern from RESEARCH.md §4 without processing real payments in the MVP.
- **No ads, no tracking, no external links to children** — MVP is COPPA-postured from day one even though it's a prototype.

Explicitly **out of scope for MVP** (flagged as the hard/costed problems below): handwriting recognition, real payment processing, native shells, multi-language content, teacher/school dashboard, backend/sync.

## 4. Hard problems & cost estimates (for the post-MVP roadmap)
| Problem | Options | Rough cost/effort | Decision needed |
|---|---|---|---|
| Handwriting/digit recognition | (a) License MyScript Interactive Ink SDK (~$$$/yr per-app licensing, fastest, highest quality) vs (b) train a small custom CNN (engineering time + need real kid handwriting data for accuracy, ongoing model maintenance, free to run) | (a) low-mid five-figures/yr license + integration; (b) 4-8 eng-weeks + data collection cost, uncertain accuracy for young kids' messy digits | **Open — see Issue "Handwriting recognition: build vs. buy"** |
| Content at scale across grades/curricula | Procedural generators (this repo's approach) + a lightweight authoring schema so non-engineers (curriculum writer) can add skill templates without code | 1 eng + 1 curriculum consultant, ~6-10 weeks to cover K-5 Common Core scope-and-sequence | Confirm target curriculum standard (US Common Core first, per Issue) |
| Adaptive mastery model | Start with a simple streak+latency heuristic (implemented in MVP `mastery.ts`), evolve to a proper Bayesian Knowledge Tracing / spaced-repetition model pre-launch | 2-4 eng-weeks for v2 model + telemetry to validate it | — |
| Real subscription billing + fair paywall | StoreKit2 (iOS) / Play Billing (Android) / Stripe or Store IAP (Windows); must implement grace periods, family sharing, restore-purchases, and a genuinely generous free tier to avoid Math Learner's reviewed dark-pattern backlash | 2-3 eng-weeks per platform | Confirm price points/free-tier generosity (Issue) |
| COPPA/GDPR-K/Apple Kids Category/Google Families compliance | Privacy policy, no behavioral ads, parental gate before purchase/external links, data-minimization review, annual policy re-certification | Legal review cost (one-time + annual), 1-2 eng-weeks implementation | Confirm legal budget owner (Issue) |
| Cross-platform shell parity (Capacitor/Tauri) | Prototype each shell early to de-risk; native plugins needed for IAP + (if built) handwriting | 2-3 eng-weeks per shell for first bring-up | — |
| School/teacher distribution channel (needed for SplashLearn/Prodigy-scale outcomes) | B2B2C sales motion, teacher dashboard, district privacy agreements — a different company motion, not just an app | Large, multi-quarter, sales-team-dependent | **Explicitly deferred** — MVP proves the consumer/paid-app model first (matches Math Learner's own, smaller-but-real, revenue model) |

## 5. Rough overall budget shape (directional, not a quote)
- **MVP (this repo)**: built now, ~1 dev-day equivalent of agent time, $0 cash cost.
- **Phase 1 (iOS launch-ready)**: 1-2 engineers × ~8-10 weeks (content buildout to full K-5 scope, native shell, StoreKit2 IAP, App Review/Kids Category compliance, QA on real devices) + design + a curriculum consultant + legal/privacy review. Ballpark **$60K-$120K** all-in before marketing.
- **Phase 2 (Android)**: incremental ~3-4 weeks once iOS exists (shared engine) — **$15K-$30K**.
- **Phase 3 (Windows Store)**: incremental ~1-2 weeks, mostly packaging/store listing — **$5K-$10K**.
- **Phase 4 (Steam, optional)**: incremental ~1 week if greenlit — **$2K-$5K**.
- **Handwriting recognition** (if pursued pre-launch rather than post-launch): add the build-vs-buy cost from §4 on top.

## 6. Milestones tracked in `LOG.md`
Every milestone (research complete, MVP scaffolded, engine done, UI polish pass, repo/issues filed, etc.) is timestamped in `LOG.md` along with bugs found, opportunities noticed, and any platform/tooling friction — this is the running "memory" of the project requested for this task.

## 7. Open questions filed as GitHub issues (blocking real Phase-1 planning)
See repo Issues for the live list; summarized:
1. Curriculum standard to target first (US Common Core assumed — confirm).
2. Handwriting recognition: build vs. license (MyScript) vs. defer past v1.
3. Confirm product name/IP is sufficiently distinct for trademark safety before real launch.
4. Confirm monetization: subscription-only (like Math Learner) vs. Prodigy-style free-core + cosmetic premium — different growth/risk profile.
5. Who owns COPPA/GDPR-K legal review and budget before any real submission.
