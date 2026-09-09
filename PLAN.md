# Plan — PIPKIN

**What we are building:** a math game for 5–8-year-olds with the craft of
DragonBox and the business model of a subscription app, built once and shipped
to iOS, Android, the Microsoft Store and Steam.

**The core idea:** *constellations are fact families.* See
[GAME-DESIGN.md](GAME-DESIGN.md) for the design; this document is scope,
sequencing, cost and risk. The evidence behind every claim here is in
[RESEARCH.md](RESEARCH.md).

---

## 1. Platform order, and why

Prioritized by real revenue potential, as asked. The argument is in
RESEARCH.md §5; this is the decision.

| # | Platform | Why | Expected share of revenue |
|---|---|---|---|
| **1** | **iOS (iPhone + iPad)** | The only hard revenue datapoint in the whole research corpus is iOS: the reference app earns ~$50K/month there from a codebase last updated in 2023. iPad is the device this game is actually for. Apple's Kids/Education editorial and the Design Awards are real, reachable distribution. | **~80%** |
| **2** | **Android (Google Play)** | Lower ARPU, more compliance work (Families policy, Teacher Approved). But the reference app's Play listing **404s** — the lane is empty — and shipping costs us store work, not engineering work. | ~15% |
| **3** | **Microsoft Store (Windows)** | Thin consumer-education category, poor discovery, few Windows tablets in 6-year-olds' hands. Ship it because MSIX from the existing build is roughly a day, and because there is genuinely no competition. | ~3% |
| **4** | **Steam** | Audience skews teen-to-adult; no curated kids-education surface; one-off purchases only. **This is a marketing and legitimacy channel, not a revenue channel.** Its real value: it is where we can sell a premium, no-subscription, no-ads edition to the parent who is furious about $9.99/week, and a Steam page is free press-kit hosting that helps with Apple editorial. Steam Deck is a genuinely novel context for this genre. | ~2% |

**The gap between #1 and #4 is closer to 50× than 2×.** So: **iOS is the
product. Everything else is distribution.** Every scoping decision below
follows from that sentence.

---

## 2. Technology, and the honest trade

**Decision: one TypeScript codebase, canvas-rendered game world, DOM UI
overlay. Wrapped per platform.**

| Platform | Wrapper |
|---|---|
| iOS / Android | Capacitor |
| Windows Store | MSIX from a Tauri or WebView2 host |
| Steam | Tauri (native window, no browser chrome, Steam overlay compatible) |

### Why not SwiftUI / native

I want to be straight about this, because it is the plan's biggest compromise.

A native SwiftUI build would be the strongest possible Apple Design Award
submission and would give the best-feeling scroll, haptics and text rendering
on the platform that matters most. It is the "right" answer for a
single-platform product.

Two things argue against it here:

1. **The brief is four platforms.** A native iOS build means a second native
   Android build and a third desktop build, or it means shipping only to iOS.
2. **There is currently no Mac.** SSH key auth to the `pb11ipad` bridge is
   rejected for every username tried (`giorgio`, `macuser`, `gisardo`, `cico`,
   `giorgiosardo`, `gsardo`, `admin`). This is filed as a blocking issue.
   Without a Mac there is no Xcode, no simulator, no signing, no submission.

**What we do about it:** the architecture keeps the door open. All game logic
(curriculum, mastery model, session scheduling) is pure TypeScript with no DOM
dependency — it is portable to a native shell as-is. The rendering layer is a
single `draw(ctx, box)` contract per component. If iOS revenue justifies it,
the render layer can be re-implemented in SwiftUI against the same logic
without rewriting the game.

**What we must not do:** ship something that *feels* like a web app. That means
60fps or nothing, no scroll bounce artifacts, no tap delay, no text selection,
no browser-default focus rings, real momentum physics, and every animation
spring-based rather than eased. The QA harness screenshots exist specifically
to catch drift on this.

### Why no external assets

The reference app is **270 MB**. PIPKIN's build is **~67 KB of JavaScript,
23 KB gzipped**, because the character, the constellations, the scenery and
every sound are generated in code. This is not a vanity metric — it is what
makes a four-platform ship tractable for a small team, keeps the Android APK
under the instant-install threshold, and means art changes are diffs rather
than binary blobs.

---

## 3. Scope

### In the MVP (built — see §5)

- Title, story prologue, onboarding, age gate.
- Chapter 1 world map as a scrolling trail.
- The core lesson loop with constellation lighting.
- Fading-star mastery model with spaced repetition.
- Session summary.
- Star Atlas (the collection screen).
- Parent gate + report.
- Procedural audio.
- Local-only storage, no accounts, no network.

### In v1.0 (post-MVP)

- **Five exercise modes**, not one. Variety is what keeps a 6-year-old for
  twenty minutes:
  - *Star Ladder* (built) — choose the missing number.
  - *Pip Frames* — ten-frame manipulative, drag pips into the frame.
  - *Balance* — a scale that must be made level; teaches equality as a relation, not as "the answer goes here."
  - *Star Bridge* — build a path by choosing facts that make a target.
  - *Meteor Shower* — the one timed mode, for fluency only, never for new material.
- Chapters 2–5 (subtraction, teens/place value, ×2 ×5 ×10, division as sharing).
- The first-fade tutorial beat (see §6).
- Accessibility: dyslexia-friendly type option, colourblind-safe constellation
  palette, full VoiceOver/TalkBack labelling, reduced-motion mode.
- Localization scaffolding (strings extracted; ship EN first).
- Parent report v2 with per-fact diagnostics and an email digest.

### Explicitly out of scope

- **Handwriting recognition.** The reference app's signature feature is also its
  most-complained-about (`"I wrote 1 and it said I wrote 7"`). Input frustration
  poisons the math. Tap and drag are reliable. This is a deliberate omission,
  not a gap.
- **Speech recognition.** Same reasoning, plus a microphone permission prompt in
  a kids' app is a trust cost with no matching benefit.
- **Accounts, cloud sync, social, leaderboards, chat.** Local-only is a feature.
  It is also the cheapest possible COPPA/GDPR-K posture.
- **Ads.** Non-negotiable.
- **Geometry, time, money, measurement.** Depth over breadth for v1.

---

## 4. Business model

**Premium-with-a-real-free-chapter**, not a 90-second paywall.

The reference app shows the paywall 1–3 minutes in, before the child has
finished a lesson. The parent buys a promise. We do the opposite: **Chapter 1
is complete and free** — a real world, a real story beat, a real constellation
collected. The parent is asked to pay *after* they have watched their child
enjoy it.

| Platform | Model |
|---|---|
| iOS / Android | Free Chapter 1. Then **$4.99/month** or **$29.99/year**, or a **$39.99 one-time unlock** for the whole game. |
| Microsoft Store | $19.99 one-time. |
| Steam | $19.99 one-time. No subscription, no ads, ever — and say so on the store page, loudly. |

Deliberate positions:

- **No weekly tier.** $9.99/week is $519/year. It works, and it is the reason
  the reference app's reviews are full of angry parents. We are not doing it.
- **The one-time unlock always exists** on mobile. It converts the segment that
  refuses subscriptions on principle, and it is the honest option.
- **Annual is priced below every named competitor** ($29.99 vs. ABCmouse's
  ~$156/yr, Prodigy's ~$120/yr, the reference app's $99.99/yr).

The bet: a lower price with a genuinely good product and no dark patterns
produces better retention and better word-of-mouth than a high price with a
trapdoor. This is a bet. It is stated here so it can be measured.

---

## 5. Status — what exists today

The MVP is built and running. `npx tsc --noEmit` clean, `npm run build` clean.
A Puppeteer harness drives real Microsoft Edge through the entire game on two
viewports (phone 430×932, tablet 1024×1366), capturing 13 screenshots each with
**zero console errors**.

| Piece | State |
|---|---|
| Curriculum data model | Done — fact families, bond families merging + and −, chapters, constellation geometry and link paths |
| Fading-star mastery model | Done — expanding hold intervals, visible decay, permanent sealing |
| Character rig (`pipkin.ts`) | Done — procedural, posed, biome-tinted, with measurable extents |
| Constellation renderer | Done — ghost shape, sockets, lighting, fade pulse, seal sparkle, completion bloom |
| Title / story / onboarding / age | Done |
| World map (scrolling trail) | Done |
| Lesson loop | Done |
| Summary | Done |
| Star Atlas | Done |
| Parent gate + report | Done |
| Procedural audio | Done |
| QA screenshot harness | Done |
| Four other exercise modes | **Not built** |
| Chapters 2–5 content | **Not built** |
| Platform wrappers | **Not built** |

---

## 6. The hard problems

These are the things that are actually difficult, listed honestly. Cost and
polish live here, not in the feature list.

### 6.1 Making the fading-star mechanic legible to a five-year-old

The mastery model is spaced repetition made visible: a star lights on the first
correct answer, holds for an expanding interval (2 min → 10 → 1 h → 1 d → 3 d →
1 w → 3 w), then visibly dims, and seals permanently at the top box.

This is pedagogically right and emotionally risky. A child who returns to find
their star dimmer may read it as punishment. **It needs a dedicated tutorial
beat the first time a star fades** — the Pipkin noticing it, being unbothered,
and relighting it together. Not built yet. This is the highest-priority
remaining design task.

### 6.2 Difficulty without a difficulty setting

A 5-year-old and an 8-year-old need different games. Placement tests are
boring and the reference app's is a documented failure point (a reviewer got
stuck in one and had to reinstall). The intended answer is inference from play
— response latency and error patterns pick the next fact — but tuning that so
it never feels punishing and never feels trivial is real work and cannot be
validated without children.

### 6.3 The "feels native" bar on a web stack

Covered in §2. This is a continuous cost, not a one-time task. Every screen
has to be looked at on a real device.

### 6.4 Audio without assets

Procedural audio that is *pleasant* is much harder than procedural audio that
*works*. The current synthesis is serviceable. Getting it to the level where a
parent does not reach for the mute button is genuine sound-design work and may
be the one place we should buy rather than build.

### 6.5 No Mac

Blocking for any iOS work at all. Filed as an issue. Until resolved, the
highest-revenue platform cannot be built for, let alone submitted.

### 6.6 Testing with actual children

Nothing above can be validated without 5-to-8-year-olds using it. Every claim
about legibility, difficulty and delight in this document is a hypothesis.

### 6.7 Store compliance for a kids' product

Apple's Kids Category, Google Play Families, COPPA and GDPR-K each impose real
requirements — no third-party analytics without consent, a parental gate before
any external link or purchase, no behavioural ads. The local-only architecture
makes most of this trivially satisfiable, which is one more reason for it.

---

## 7. Cost

Assumes a small team; ranges reflect the difference between doing it well and
doing it very well.

| Item | Estimate |
|---|---|
| Engineering to v1.0 (5 modes, 5 chapters, polish) | 4–6 months, 1–2 engineers |
| Sound design (the one thing worth buying) | $3–8K |
| Playtesting with children (recruit, sessions, iteration) | $5–10K |
| Localization, 5 languages | $3–5K |
| Apple + Google + Microsoft + Steam developer accounts | ~$300 |
| Legal review (kids' privacy, store compliance) | $2–5K |
| Launch marketing / press kit / trailer | $5–15K |
| **Total non-engineering** | **$18–43K** |

Recurring: no server costs, because there is no server. That is a deliberate
architectural choice with a direct margin consequence.

---

## 8. Sequence

**Phase 1 — MVP (done).** One chapter, one mode, the whole shell, running with
zero console errors on two viewports.

**Phase 2 — the game.** First-fade tutorial beat. Pip Frames and Balance modes.
Chapter 2. Difficulty inference. This is the phase that decides whether it is a
good game or a nice demo.

**Phase 3 — iOS.** Resolve the Mac blocker. Capacitor wrap. Real-device polish
pass: haptics, safe areas, ProMotion, VoiceOver. Submit to the App Store.

**Phase 4 — everything else.** Android + Families compliance. MSIX for the
Microsoft Store. Tauri build for Steam with a Steam page and trailer.

**Phase 5 — content.** Chapters 3–5, remaining modes, localization, parent
report v2.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Khan Academy Kids is excellent and free | High | Compete on craft and on being a *game*, not on curriculum breadth. Accept that we lose the price-sensitive segment entirely. |
| The premium model under-monetizes vs. $9.99/week | High | Stated as a deliberate bet in §4. Measure it. The one-time unlock is the hedge. |
| No Mac → no iOS → no revenue | **Blocking** | Filed as an issue. Nothing else matters as much. |
| Fading stars read as punishment | Medium | §6.1. Tutorial beat, then test with children. |
| Web stack fails the polish bar on device | Medium | Continuous device testing; the logic layer is portable to native if it does. |
| Wildlife Studios wakes up and rebuilds | Low | Two years of silence and a portfolio pointed elsewhere. |
| ASO — "math learner" is their keyword | Medium | Do not fight for it. Win on visuals in the screenshots and on editorial placement. |
