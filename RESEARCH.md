# Research: "Math Learner: Learning Game" (iOS id1148728253) and the kids-math-app market

Date: 2026-09-08 · Researcher: Copilot CLI (@gisardo's agent)

## 1. Target app: Math Learner: Learning Game
- **Publisher**: Wildlife Studios (Brazil), via brand "Fun Games For Free" / TFG Co. Not "Chocolate Apps" (an old/incorrect attribution found in some aggregator sites).
- **Positioning**: "Have fun while learning and practicing Math ... proven methodology based on the world's top programs." Framed as a *game* (avatar, pet, cosmetics) wrapped around drill exercises, not a narrative RPG like Prodigy.
- **Core features (from store listing + reviews)**:
  - Thousands of exercises across "multiple game-based learning strategies."
  - Grade-level selection at onboarding (preschool → grade 5, extending to grade 6 for curricula like CBSE/ICSE/State Board in some markets) — implies **localized curriculum variants**, not just one global curriculum.
  - **Handwriting/digit recognition**: kids draw the digit answer on-screen; app recognizes it. This is the app's signature interactive gimmick and a real point of technical investment (marketed explicitly as "high-accuracy digit recognition technology").
  - Profile creation, avatar + **pet customization** (accessorize a pet) — retention/reward loop, not just correctness feedback.
  - Progression unlocks: division, fractions, and other operators unlock as the player advances — classic skill-tree gating.
  - Offline-capable, no ads (monetization is 100% subscription).
  - Frequent content updates (new lesson packs, video tutorials, "rough work"/scratchpad tool mentioned in some listings).
  - Multi-language (9+ languages).
- **Monetization**: Freemium teaser (a few problems free) → hard paywall. Subscription tiers seen across markets: weekly ~$7.99–$11.99, monthly ~$24.99–$39.99, annual ~$99.99, with a short (often 3-day) free trial. Classic "Apple pricing matrix" auto-localized pricing.
- **Reception**: ~4.4–4.6★ over 100K+ ratings. Praised: fun/engaging, pet + avatar loop, breadth of levels, "cheaper/easier alternative to IXL." Criticized hard, repeatedly:
  1. **Aggressive/early paywall** — users report being walled off almost immediately, short 3-day trial, "says free but isn't," confusing subscription cancellation flow (classic dark-pattern complaints — a compliance and trust risk we should deliberately avoid).
  2. **Answer-input frustration** — handwriting recognition or fixed-format answer boxes reject technically-correct input (e.g., "8+5", entering "1" as a partial digit rejected) — signals the input/validation UX is a real hard problem, not just a training-data problem.
  3. Occasional tone complaints — negative-feedback microcopy ("horrible") reads as harsh to kids; tone-of-voice for error states matters for a product aimed at ages ~5–11.
  4. Some "not enough teaching, only drilling" feedback when using hint/"learn" button — indicates a gap between practice and instruction that a differentiated product could fill (worked examples / video hints).
- **Estimated business performance** (third-party estimates, directional not exact): ~10K downloads/month and ~$50K/month revenue for the iOS SKU in recent trackers — i.e. roughly **$500K–$700K/year**, long-tail/legacy title (App Store id from 2016) still monetizing via subscription, not a top-10 grossing education app but a solid, durable niche earner. This matters for our prioritization: **a well-executed single-platform math app in this genre can sustain high-6-figure annual revenue on iOS alone**, without needing to be a SplashLearn/Prodigy-scale breakout.

## 2. Competitive landscape
| App | Model | Est. revenue | Notes |
|---|---|---|---|
| **SplashLearn** | Freemium, B2B2C (free for teachers/schools, paid for parents/home) | ~$35M/yr | Largest reach (40M+ students, 750K+ teachers, 150+ countries). School-distribution flywheel is the moat. |
| **Prodigy Math** | Free core game + paid "Premium" membership (cosmetics/perks, not content-gated) | ~$25–35M/yr | RPG wrapper (battles, wands, pets) around curriculum-aligned math questions; monetizes FOMO/cosmetics rather than gating content — different ethical stance than Math Learner's hard paywall. |
| **DragonBox (Kahoot!)** | One-time paid apps ($5–10 each) per topic (Numbers, Algebra, Big Numbers, Fractions...) | ~$3–7M/yr (sub-segment of Kahoot!) | Conceptual/manipulative-based learning, no drill-and-kill; beloved by educators; smaller reach because one-time-price + niche pedagogy limits virality. |
| **Todo Math** | Freemium subscription | ~$1–3M/yr | K-2 focus, manipulatives, good design, smaller marketing budget. |
| **Monster Math** | Paid app + IAP | <$1M/yr | Indie, RPG-flavored, small scale. |
| **Photomath** (adjacent) | Freemium (camera solve) + subscription for step-by-step | Much larger ($100M+ reported historically) but different job-to-be-done (homework solver for older students, not K-5 drill) — not a direct competitor but shows camera/vision-based math UX has large proven demand. |
| **Khan Academy Kids** | Free (nonprofit-funded), no IAP | $0 direct revenue | Sets the quality/ethics bar (free, no ads, no paywall) that paid competitors are compared against in reviews; hard to compete with on price, must compete on production values/motivation loop. |

**Pattern across the category**: the two revenue leaders (SplashLearn, Prodigy) both won via **school distribution as the acquisition channel**, then converted a fraction of parents to paid — not via App Store search/ads alone. Pure paid-app or aggressive-paywall models (Math Learner, DragonBox) plateau in the low single-digit to high-6-figure millions. This is a key strategic input: **long-run scale requires a teacher/school-facing free tier**, but **near-term MVP validation can and should be mobile-app/paywall-based** like Math Learner, since that's provable without a sales motion.

## 3. Platform revenue-potential ranking (for this product concept)
Ranked by realistic, evidence-backed revenue potential for a kids (ages ~5–11) math learning app:

1. **iOS / App Store (iPhone + iPad) — #1 priority.**
   - Proven direct comparable (Math Learner itself) monetizing here primarily; iOS historically over-indexes on paid conversion/ARPU vs Android, especially in US/UK/AU/CA — the core English-speaking parent-paying market.
   - Family Sharing, Screen Time/parental controls, Kids Category, and App Store subscription APIs are mature and trusted by parents.
   - iPad is the primary device for at-home kid learning time — large, high-intent surface.
2. **Google Play (Android) — #2 priority.**
   - Larger global installed base (esp. outside US/EU) but materially lower ARPU/paid-conversion historically for consumer subscriptions; still necessary for reach and required for classroom/Chromebook households.
   - Google Play "Teacher Approved" / Kids category gives a credible discovery surface analogous to Apple's Kids Category.
3. **Windows Store (Microsoft Store, Windows 10/11 PC & tablet) — #3, secondary/companion priority.**
   - No evidence of any meaningfully-monetizing kids-math title on Microsoft Store; discovery is weak, and the core buying audience (parents on phones, kids on tablets) under-indexes on Windows for this job-to-be-done.
   - Still worth shipping (near-zero marginal cost once we're on .NET/web-stack for Windows) as (a) a homeschool/school-lab desktop companion, (b) a Windows-on-ARM/Surface differentiator, (c) works well for a "family shared PC" use case some households still have.
   - Treat as a **distribution add-on, not a revenue driver** — do not custom-build features exclusively for this SKU.
4. **Steam — #4, lowest priority / opportunistic only.**
   - Steam's user base and discovery algorithms are built around a teen/adult gaming audience; there is no track record of a K-5 drill-based paid learning app achieving meaningful revenue there, and Steam lacks native parental-consent/subscription-billing patterns that App Store/Play provide.
   - Only worth doing later as a near-zero-cost repackage (e.g., via Steamworks wrapping the same Windows build) targeting homeschool families who already buy educational/simulation titles on Steam (e.g., ports of "family PC" edu games) — expect low four-to-five-figure annual revenue at best, positioned as brand/reach, not a P&L line.

**Conclusion**: build **mobile-first (iOS, then Android)**; ship **Windows Store** as a cheap byproduct of the same codebase for reach/goodwill; treat **Steam** as optional, last, low-effort.

## 4. Legal/ethical guardrails learned from competitor complaints
- Avoid Math Learner's most-criticized pattern: marketing as "Free" while paywalling within the first 1–2 problems, and short (3-day) trials with unclear cancellation. Use Apple/Google's standard subscription disclosure UI, a longer meaningful free tier (e.g., 1 full grade-level lesson set, or daily free-problem cap) before any paywall, and a visible in-app "Manage/Cancel subscription" deep link.
- Avoid harsh/shaming microcopy on wrong answers (reviews specifically called this out as upsetting kids). Use encouraging, growth-mindset copy.
- COPPA (US) / GDPR-K / Apple Kids Category / Google Families Policy compliance is mandatory from day one if we target under-13s directly: no behavioral ad tracking, parental gate before purchase links or external links, minimal data collection, no open chat/UGC.
- Do not copy Math Learner's specific mascot/pet-dog IP, exact visual style, or copy their exact question bank — build original content and characters (also true for DragonBox/Prodigy IP).

## 5. Hardest technical/product problems identified (feed into PLAN.md cost estimate)
1. **Answer input & validation UX** — free-form digit/handwriting entry vs. multiple-choice vs. drag-and-drop manipulatives; must handle multi-digit, negative, fraction, and partial-input states without false "wrong" feedback (a direct, named competitor complaint).
2. **Handwriting/digit recognition** — the app's signature feature; options are (a) build a small on-device CNN (e.g., MNIST-style, extended to operators/fraction bars) — real ML data-collection and accuracy work, or (b) license a handwriting SDK (e.g., MyScript) — real recurring cost. This is explicitly called out as an open, costed decision in the plan, not solved in the MVP.
3. **Content generation at "thousands of exercises" scale** — must be procedural (parameterized generators per skill, e.g., "2-digit addition no regrouping," "fraction equivalence") rather than hand-authored, or content cost explodes; but procedural generation must still guarantee pedagogically sound distributions (no duplicate-feeling drills, correct difficulty curve) — this is a design+eng problem, not just a content problem.
4. **Adaptive difficulty / mastery model** — deciding when a child has "mastered" a skill and should progress vs. needs more practice (spaced repetition + mastery thresholds) is the actual pedagogical IP; get this wrong and the product is just a random-problem generator.
5. **Curriculum alignment & localization** — different markets expect different scope-and-sequence (Common Core vs. CBSE vs. UK National Curriculum); this multiplies content-authoring/testing effort per market.
6. **Trustworthy, non-dark-pattern monetization** that still converts — direct tension identified from competitor 1★ reviews; needs deliberate UX/legal design, not an afterthought.
7. **Cross-platform parity** with native-feeling input (touch/pencil on iPad, mouse/touch on Windows, touch on Android) while sharing a codebase economically.

See `PLAN.md` for how these translate into a phased build plan, cost ranges, and the MVP scope built in this repo.
