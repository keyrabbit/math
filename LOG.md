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

---

## 2026-09-08 — REJECTED. Full pivot.

The user rejected the "Number Nest" MVP outright, and the criticism was correct:

> *"I didnt ask you to vibe code a shitty looking app, with fake experience and simple
> additions... aim to create an app that will win apple awards. not a crappy web app with
> silly steps. the other app i gave you was almost like a game, there is a story behind
> i think"*

**What I got wrong, recorded plainly so it is not repeated:**

- I researched the reference app's *metadata* (publisher, pricing, reviews, revenue) and
  called that research. I never looked at how it actually plays. I never opened a single
  screenshot.
- I built the thing that was cheap to build — a quiz with a mascot glued on top — and told
  myself the polish could be added later. Polish is not a layer you add to the wrong
  structure.
- "Web app with silly steps" is exactly right. I had a page with buttons, not a game.
- I substituted breadth (5 operations! fractions!) for depth. The reference app's whole
  advantage is that it feels like something, and I had built something that felt like a form.

**Process lesson, which is the transferable one:** when the brief is about craft, metadata
research is not research. Look at the artefact.

## 2026-09-08 — Deep research pass

- Used `https://itunes.apple.com/lookup?id=1148728253&country=us` — anonymous, returns clean
  JSON with full-resolution screenshot URLs, exact rating counts, version, byte size. Far
  better than scraping the store page HTML. **Worth remembering for any app research.**
- Downloaded and *actually viewed* 3 iPhone + 3 iPad screenshots (`research/reference/`).
  Structural facts that only came from looking: the fact-family ladder layout, the arena's
  live points ticker, the ten-frame manipulative, the rounded school-print numerals.
- Apple's screenshot CDN resizes by swapping the trailing `NNNxNNNbb.jpg` path segment.
- Ran a background research agent for exhaustive gameplay reverse-engineering → 37.5 KB,
  ~90 citations, saved to `research/reference-report.md`.
- Read the craft skills at `C:\Usr\PB11iPad\.skills\` (`emil-design-eng`,
  `animation-vocabulary`) before designing anything. Directly changed the outcome: every
  animation in PIPKIN is spring-based rather than eased because of it.

**The findings that mattered most:**

1. **The reference app has no story at all.** Common Sense Media: *"not so much lessons, but
   really collections of drills."* I had assumed a narrative because the marketing implies
   one. There isn't one. That is the opening.
2. **Wildlife Studios' Zendesk is a better source than any review site** — the exact points
   thresholds (1000 max; <400=1★, 400-699=2★, ≥700=3★), the 5/10/15/20-minute daily goal
   tiers, and the precise free-gift schedule (immediately, +3min, +6min, +30min, +1h, +3h,
   then every 6h) all came from support articles. **Generalizable: for any competitor
   analysis, read their support docs, not their marketing.**
3. **Non-US storefronts carry different marketing copy for the same app ID.** CA/AU/IN say
   *"based on a proven Japanese methodology"*; the US listing removed it. Comparing
   storefronts surfaced a claim (it means Kumon) that was invisible from the US page alone.
4. **The Google Play listing 404s.** `com.fungames.mathapp` is gone. Their entire ~$50K/month
   is iOS-only. This single fact drove the whole platform prioritization.
5. **Last update was December 2023.** Maintenance mode. Not an active competitor.
6. **The handwriting recognizer is their most-loved feature in marketing and their
   most-hated in reviews** (*"I wrote 1 and it said I wrote 7"*, *"if I were to write a nine
   it would put a six or even a four"*). One reviewer got stuck in an un-exitable placement
   test and had to reinstall. **Decision: we do not ship handwriting recognition.** An
   unreliable input layer poisons the math underneath it.
7. A child reviewer: *"it said horrible and I was just offended."* Design rule adopted:
   never evaluate the child, only the answer, and always warmly.
8. **Research hazard:** a copycat app (`id6757360456`, "Math Learner: Fun Brain Games" by
   Tilak Shakya) mimics the branding and dominates search for the original's name. Much of
   the "Math Learner is great" content online is about the *other* app. Cost me real time.

## 2026-09-08 — PIPKIN: the design

The insight the whole game is built on: **a constellation IS a fact family.** The set of
facts that make 5 has a shape. Answering lights a star. The picture that emerges is the
structure of the number — so the drill and the reward are the same object, rather than
"do worksheets, and unrelatedly a dog gets a hat."

Design decisions worth recording:

- **Bond families merge addition and subtraction** into one constellation per number. This
  is pedagogically correct (part-whole relationships are one idea, not two) and halves the
  node count. Facts involving 0 are excluded — they teach nothing and pad the count.
- **Fading stars.** A star lights on the *first* correct answer and holds for an expanding
  interval (2min → 10 → 1h → 1d → 3d → 1w → 3w), then visibly dims to a 0.3 floor, and seals
  permanently at the top box. This replaced an earlier "must survive 3 reviews before it
  lights" model that produced *"0 of 6 stars lit"* after a child played perfectly. **Lesson:
  a mastery model that is correct but invisible is a broken mastery model.** Reward the
  behaviour immediately; express the uncertainty in the *decay*, not in the delay.
- **Everything drawn in code.** The reference app is 270 MB. PIPKIN is ~67 KB of JS (23 KB
  gzipped) including the character, constellations, scenery and all audio. This is what
  makes a four-platform ship tractable at all.
- Canvas 2D for the world, DOM overlay for UI.

## 2026-09-08 — Build, and the bugs that only screenshots found

Built the engine, mastery model, character rig, constellation renderer and six screens. Then
built a Puppeteer harness driving real Edge through the whole game on two viewports, and
**viewed every screenshot on every pass.** Every single bug below was found by looking, not
by reasoning. None would have been caught by a type checker or a unit test.

1. **The very first exercise was unsolvable.** Onboarding grabbed `facts[facts.length-1]` —
   a subtraction — then rendered it with a hard-coded `"+"`. The child's first-ever question
   read `5 + 2 =` with options 3, 1, 4. The single worst possible bug in the product, and it
   shipped through a clean type check.
2. **The character read as permanently angry.** Two causes: the brow rotation sign was
   inverted (`rotate(-side*angle)` puts the *inner* corners down = angry; correct is
   `rotate(side*angle)`), and brows drew at full opacity in every mood. Idle is now
   browless. **Generalizable: for a friendly character, the default expression should have
   no eyebrows at all.**
3. **Muddy body colour.** `paletteForBiome` was setting `bodyBottom: accent`, so in the
   meadow biome the character's gradient ran blue→orange. Fixed by giving the Pipkin a
   *constant identity palette* — the biome now tints only the glow and the eyes. A character
   that changes colour with the background is not a character.
4. **The belly read as a face-mask.** A hard white ellipse looked like a muzzle. Replaced
   with a soft radial gradient clipped to the body. The rim light had the same problem — a
   solid arc read as a helmet edge; now a gradient stroke.
5. **Unlit sockets were nearly invisible** (~0.16 alpha) so the sky looked broken rather than
   full of promise. Now drawn in *cool white* rather than the constellation's warm colour —
   at low alpha a warm hue mixed with the purple sky into muddy olive. Colour became the
   *reward* for lighting a star.
6. **The character overlapped the equation, the headline or the keypad on every single
   screen.** Root cause: the Pipkin's transform anchor is its body centre, but screens were
   positioning it by viewport fractions. **The fix became the most valuable pattern of the
   whole build: any element the canvas must align with gets a real DOM box, and the canvas
   measures that box back via `getBoundingClientRect()`.** No magic numbers, and it survives
   every viewport, font size and safe-area inset automatically.
7. **The map arc could not fit 10 nodes on a phone.** Redesigned as a vertical scrolling
   trail — which also matches the reference app's vertical "Books" list. The canvas lives
   *inside* the scroller so trail and nodes scroll together with zero sync logic.
8. **The summary listed duplicate fact chips** — a lesson is 8 questions but `bond:5` has
   only 4 facts, so facts necessarily repeat. De-duplicated by fact id; a fact is "shaky" if
   it was *ever* missed.
9. **Constellation colours read as highlighter-yellow** at HSL 88% sat / 66% light. Banded
   the hue per family kind and dropped to 70/74.
10. **Tablet was a stretched phone.** Added a real breakpoint rather than scaling.

**Tooling gotchas worth keeping:**

- `localStorage` is shared across pages in one browser profile, so the second viewport in a
  QA run saw `onboarded: true` and the title button read "Continue" instead of "Begin".
  **Every viewport needs its own `browser.createBrowserContext()`.**
- Screenshots need ~1500 ms to settle or you capture animations mid-transition — the same
  class of bug as the `--virtual-time-budget` colour-washing issue logged in the previous
  phase. This has now bitten twice on two different harnesses.
- The harness parses answers out of the live DOM rather than recomputing them, which means
  it also validates the rendering. Regex must use **U+2212 MINUS SIGN**, not a hyphen.
- TypeScript `erasableSyntaxOnly` (on by default in this config) makes constructor parameter
  properties (`constructor(private readonly x)`) a compile error. Use explicit fields.
- `Start-Process -FilePath "npx"` fails with *"%1 is not a valid Win32 application"* on
  Windows — use `npm run <script>` instead.

## 2026-09-08 — Docs rewritten to match reality

- `RESEARCH.md` and `PLAN.md` were still describing the rejected "Number Nest" build. Both
  fully rewritten against the deep-research findings.
- Platform prioritization now argued from evidence rather than assumed: **iOS → Android →
  Microsoft Store → Steam**, with the gap between first and last closer to 50x than 2x.
  Grounded on: the reference app's ~$50K/month being iOS-only (their Play listing is dead),
  the kids' math-app market at ~$2.3B (2025), and Steam's audience for a 5-year-old's math
  game being genuinely tiny. **Recorded honestly: Steam is a marketing and legitimacy
  channel for this product, not a revenue channel** — worth shipping because Tauri packaging
  is cheap and because it is where a no-subscription premium edition can be sold to the
  parent who is angry about $9.99/week, not because it will move the revenue line.
- Business model set deliberately against the reference app: a **complete free Chapter 1**
  instead of a paywall at 90 seconds, $4.99/mo or $29.99/yr, a $39.99 one-time unlock that
  always exists, and **no weekly tier** ($9.99/week is $519/year, and it is why their
  reviews are full of angry parents).


## 2026-09-09 — Second MVP: Crumb's Bakery

**Why.** Demoing the Pipkin build produced one clear piece of feedback: *the story is a bit hard
for a five-year-old*. It is. "The counting-stars fell from the sky and scattered as pips, and you
relight the constellations" is an abstraction resting on two other abstractions — the child has to
learn the story before the story can help them learn the maths. Three alternative narratives were
proposed (Sprout's Garden, Bubbles the Fish, Crumb's Bakery); the bakery was chosen and built as a
**separate, parallel MVP** in `app-bakery/`. `app/` is untouched — verified with `git status`.

**What was built.** A complete re-theme, not a reskin. Every term the child sees was replaced:
constellation → recipe, star → treat, pip → sprinkle, Star Atlas → Bakery Case, biome → room,
lit/fading/sealed → fresh/stale/house special. Chapters became The Little Kitchen, The Pantry, The
Morning Market, The Bakehouse and The Party Room. `render/pipkin.ts` → `render/crumb.ts`,
`render/constellation.ts` → `render/shelf.ts` + `render/treats.ts`, `screens/atlas.ts` →
`screens/case.ts`. Palette moved from indigo night to roast-brown-and-amber oven light. New docs:
`GAME-DESIGN-BAKERY.md` and `app-bakery/README.md`. Runs on :5174 alongside :5173.

**The finding that made it worth doing.** The pedagogy, the scheduler, the spring rig, the canvas
world and the screen architecture all came across essentially unchanged. `game/mastery.ts` needed
renames and not one changed interval. **The theme is not the expensive part of this build** — which
is exactly the thing you want to know before commissioning art for one narrative.

**One real pedagogical improvement fell out of the re-theme.** Pipkin laid its stars on a seeded
spiral: pretty, but arbitrary. The bakery shelf is a **grid**, and the grid puts a fact family's
additions directly above the subtractions that undo them. The inverse relationship is now visible
in the layout itself rather than only in the sequence. Worth back-porting.

**Bugs the visual QA pass caught (all invisible in code review):**

1. **Apron straps ran across Crumb's face.** A one-circle character has no shoulders, so straps
   drawn from bib to head land on the cheeks and read as red slashes. Bib trim line instead.
2. **Treats floated above the plank.** The plank y was hard-coded at 0.92 unit space, but a pie,
   a bun and a doughnut all rest at different heights. Exported `TREAT_BASE` per shape.
3. **The active-slot indicator read as a grey smudge.** A large soft radial gradient over a dark
   background does not read as light, it reads as dirt. Tight lit ellipse plus a light cone.
4. **Shelf thumbnails spilled outside their order-ticket discs.** `drawStatic` needed a second
   fit pass measuring `radius*k + size*0.95` against the disc radius.
5. **"Sugar Cookies" were plated as buns.** Shape was seeded from the recipe key rather than its
   name. A child who can read the ticket notices immediately.
6. **The keypad fell off the bottom at 780×420.** Added a `max-height: 560px` breakpoint and a
   two-column landscape grid.

**The battlement problem — three passes, worth recording.** The backdrop silhouette started as
stepped flat-topped runs, the obvious rectilinear translation of Pipkin's rolling hills. It read
unmistakably as **castle battlements** in every screenshot. Widening the runs did not fix it.
Dropping from four height steps to two did not fix it. Shrinking the jars did not fix it. The
actual cause is that crenellation *is* a regular up-down at constant amplitude, so any stepped
horizon at a fixed step height reads as a castle no matter how the widths are tuned. The fix was
to **delete the steps entirely**: each plank is one dead-flat horizontal, and all silhouette
interest comes from varied crockery standing on it — jars with lids, wide shallow bowls, tall
narrow bottles, short knobbed tins. Long horizontals broken by objects of different heights is
what shelving actually looks like. Generalisable: *when a silhouette reads as the wrong object,
tune the thing that is varying, not the thing that is constant.*

**On a theme picker.** Deliberately not shipping one. Two selectable stories double the art, copy,
QA and localisation surface forever in exchange for a preference nobody has asked for. The
architecture now demonstrably supports many themes; hold the option until a real child bounces off
one and engages with the other. Build for many, ship one.

---

## 2026-09-09 — Packaging: a Kindle Fire APK and an iPad build

Crumb's Bakery is a web app; it now also runs as a native app on both tablet ecosystems. Two
hand-written WebView shells, no Capacitor, no Cordova. Details in `app-bakery/native/README.md`.

**Capacitor was the obvious choice and was rejected.** Its iOS platform requires CocoaPods, which
is not installed on the Mac this project borrows for iOS builds, and installing a package manager
on a machine we do not own is not something to do casually. The shells turned out to be small —
one Java file and three Swift files — and they preserve the project's zero-runtime-dependency
property. The decision paid for itself immediately: because nothing was hidden behind a framework,
both of the real bugs below were visible.

**Bug 1: `file://` would have silently destroyed every save.** `localStorage` is the entire
save system. A WebView loading `file://` gets an opaque origin, and storage on an opaque origin
is unreliable across OS versions — sometimes empty on relaunch, sometimes throwing. Android now
serves the bundle through `WebViewAssetLoader` on `https://appassets.androidplatform.net`;
iOS through a custom `bakery://app/` scheme handler. Both are now *verified* rather than
assumed: the build scripts assert the key `crumbs-bakery.save.v1` is physically on disk after a
launch, and it is — real save JSON in the Chromium LevelDB on Android, the key present in the
WebKit sqlite on iOS.

A side effect worth keeping: every request the page makes resolves inside the app bundle. There is
no code path from the page to the network at all. For a children's app that is a structural
property rather than a promise.

**Bug 2: the first APK rendered nothing, and looked completely healthy doing it.** It installed,
launched, drew the brown background and stopped. No crash, no ANR, process alive. The only
evidence anywhere was one line of `adb logcat`:

`[INFO:CONSOLE(1)] "Uncaught SyntaxError: Unexpected token '='"`

Vite's default build target assumes an evergreen browser. A Fire tablet is not evergreen. The API
30 emulator ships Android System WebView 83; logical assignment (`??=`, `||=`) needs Chrome 85.
The app was one operator away from a blank screen on real hardware, and nothing in the browser
would ever have shown it. `vite.config.ts` now pins `build.target: "es2017"`, and
`index.html` carries a `nomodule` fallback so a genuinely ancient WebView says so in words
instead of showing a brown void.

Generalisable: *a WebView is not the browser you developed in, and its failure mode is silence.*
Any web app shipped natively needs a device-console check in the loop, not just a screenshot.

**Both round trips are scripted, because a build you cannot repeat is a demo.**
`tools/Invoke-AndroidBuild.ps1` and `tools/Invoke-MacBuild.ps1` each do preflight, build,
install, launch, screenshot and a storage assertion. The Mac one drives Xcode over SSH and fetches
XcodeGen as a self-contained binary into a scratch directory, so the borrowed machine gets nothing
installed and `-Action Clean` removes all trace.

Three smaller things that cost real time and are worth not rediscovering:

1. **`winget` blocks forever on an elevation prompt** in a non-interactive shell. The whole
   Windows toolchain — JDK 17, Android SDK, Gradle — is portable zips under `C:\UsrP\toolchain`,
   needs no administrator rights, and can be deleted wholesale.
2. **PowerShell here-strings sent over SSH carry CRLF**, and zsh reads `fi\r` as a word rather
   than the keyword, so an `if` block never closes and fails as a parse error several lines
   later. `Invoke-Remote` strips `\r` centrally.
3. **`-destination 'name=...'` is not reliable for simulators.** Which device names exist depends
   on which runtimes are installed, so xcodebuild can refuse a device that `simctl` happily
   lists. Resolve to a UDID from `-showdestinations` instead.

Verified: Android builds, launches and renders correctly on an API 30 tablet emulator at
2560x1800, hardware back behaves, and save data survives exiting the app. iOS builds, launches and
renders correctly on an iPad Air 11-inch (M4) running iOS 26.5, and storage persists across
backgrounding. Still open: no physical Fire tablet on hand for the final sideload, and an iOS
*device* build needs an Apple team ID that does not exist yet — simulator only until it does.

### The bug the screenshot could not see

The paragraph above was written in good faith and was wrong in the way that matters. "Launches
and renders correctly" was proved with a screenshot of the title screen. Both issues asked for
something stronger — *a full lesson can be completed* — and nothing had actually tested that.

So the WebView was opened up properly: `adb forward` onto its devtools socket, and a script
(`tools/device-lesson-qa.mjs`) that plays a real recipe on the real device over the Chrome
DevTools Protocol. The first run got exactly one screen further than the screenshot did:

```
Uncaught TypeError: a.replaceChildren is not a function
```

`Element.replaceChildren` arrived in Chrome 86. The emulator's WebView is 83. Every screen
transition in the app used it, so **Crumb's Bakery was unplayable past its title screen** — while
photographing perfectly. Fixed with a four-line `setChildren()` in `src/core/dom.ts`, applied at
all nine call sites.

The interesting part is *why* the earlier ES2017 fix did not cover this. `build.target` rewrites
syntax; it does not polyfill APIs. Those are two separate compatibility surfaces and only one of
them is a build setting. A sweep for the other one found CSS `inset` (Chrome 87, breaks overlay
positioning — fixed with longhand), flex `gap` (84) and `aspect-ratio` (88). The last two were
left alone: an on-device screenshot of the summary card showed spacing a little tight and
everything else correct, which is the right trade for a browser real Fire tablets have long since
moved past. The rule that fell out is worth keeping — **fix what breaks behaviour, accept what
costs pixels, and decide from a device screenshot rather than a spec table.**

That check is now `-Action Verify`, part of the build script rather than a one-off. It walks
onboarding, an age band, a map node, eight facts and the summary, then reads `localStorage` back
to confirm the progress was saved, and fails on any console error. It currently reports 8 treats
baked, 42 facts mastered, 1 recipe completed, **0 console errors**.

Generalisable, and the sharper version of the earlier lesson: *a screenshot proves a frame
rendered, not that an app works.* The two device-only bugs in this session both left the process
alive, responsive and photogenic. Neither was reproducible in a desktop browser. If a web app is
being shipped natively, something has to actually play it on the device.
