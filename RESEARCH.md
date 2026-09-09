# Research — the market, the reference app, and what actually makes money

This is the evidence base for [PLAN.md](PLAN.md) and [GAME-DESIGN.md](GAME-DESIGN.md).
The exhaustive source-cited reverse-engineering report lives in
[research/reference-report.md](research/reference-report.md) (37 KB, ~90 citations).
This file is the distillation and the argument.

---

## 1. The reference app

**Math Learner: Learning Game** — App Store `id1148728253`, bundle `com.fungames.mathapp`.

| Fact | Value | Source |
|---|---|---|
| Publisher | Wildlife Studios (was "Fun Games For Free") | App Store listing; privacy URL still `fungames-forfree.com` |
| Launched | 6 September 2018 | paywallscreens.com, SensorTower |
| Latest version | 3.0.3 — **19 December 2023** | App Store changelog |
| Rating | **4.616★ from 120,976 ratings** (US) | iTunes Lookup API |
| Size | ~270 MB | iTunes Lookup API |
| Age target | 4–11 (PreK–5) | App description, Brighterly |
| Est. revenue | **~$50K/month** | paywallscreens.com |
| Google Play | **404 — delisted** | direct check of `com.fungames.mathapp` |

Two structural facts jump out and they drive almost everything downstream.

**It has not shipped a feature in over two years.** December 2023 was the last
update. Wildlife Studios is a Brazilian mobile-games company known for Zooba and
Tennis Clash; this is a maintenance-mode asset in a portfolio that is about
something else entirely. A well-made competitor is not fighting an active team.

**It is not on Android.** The Play listing 404s. Whatever the reason —
policy, economics, or neglect — the reference app's ~$50K/month is
iOS-only revenue. That is the single most important number in this document,
and it is discussed again in §5.

### What it actually is

Common Sense Media's verdict is the most useful sentence written about it:

> *"not so much lessons, but really collections of drills."*

The app's own marketing calls this a virtue. Non-US storefronts (CA, AU, IN)
advertise *"a proven Japanese methodology"*; the US listing softened this to
*"a proven methodology based on the world's top programs."* The "Japanese
methodology" is almost certainly **Kumon** — daily short drills, tiny
increments, mastery before advancement, minimal instruction, errors corrected
by repetition. The app's structure matches Kumon point for point.

That is a real, defensible pedagogy. It is also, unambiguously, worksheets.

### Onboarding (the money-critical 90 seconds)

1. Age selection.
2. A **digit-writing calibration** — write a number with your finger.
3. A short **placement test** to pick a starting Book.
4. **Paywall, 1–3 minutes in.**

The paywall arrives before the child has completed a single lesson. The parent
is asked to pay based on a promise, not an experience. This is the standard
hyper-casual playbook and it is why the revenue is high and the retention
(implied by the review corpus) is not.

### The hub

A **vertical scrolling list of "Books"**, each a topic. Progress is
mastery-gated: you finish a Book to open the next. A "Jump to" control lets a
parent skip ahead. This is a table of contents, not a world.

### The five exercise modes

| # | Mode | Notes |
|---|---|---|
| 1 | **Handwriting recognition** | Draw the digit in a rounded box. The app's signature feature and by far its most complained-about. |
| 2 | **Ten-frame + multiple choice** | A genuine manipulative — Singapore/Common Core style, even though the app never claims it. |
| 3 | **Dark "game show" arena** | Navy background, points ticker, expression-matching card stack. The only mode with any game feel. |
| 4 | **Speak your answer** | Siri speech recognition. |
| 5 | **"Multiplication Splash"** | Name only; no description or screenshot found anywhere. |

### Meta-progression

- Up to **1,000 points** per lesson → **<400 = 1★, 400–699 = 2★, ≥700 = 3★**.
- **Daily goals** of 5 / 10 / 15 / 20 minutes.
- **Free gifts on a fixed time schedule**: immediately, +3 min, +6 min, +30 min,
  +1 h, +3 h, then every 6 h. Note: *time-based, not performance-based.*
- The reward itself is **costumes for a corgi mascot**. CSM: *"the rewards
  system gives kids items to dress up a pet dog."*

No leaderboards, streaks, coins, or chests are confirmed.

### Curriculum scope

Counting → digit writing → single-digit +/− → double-digit +/− →
multiplication tables in strict order (2×, then 3×, then 4×…) → division →
fractions. Four operations plus fractions. **No geometry, measurement, time,
money, or data.** Marketing says "thousands of exercises"; third-party
aggregators inflate this to "5,000+".

### Art direction

Thick-outlined 2D cartoon. Solid fills, minimal gradients. Plush-toy
proportions, large round eyes. Cream/golden corgi-ish mascot. Light airy
backgrounds in most modes, dark navy in the arena. Rounded school-print
numerals. Heavy rounded sans for marketing headlines.

It is competent, legible, and completely generic. It looks like every other app
in the category because it is drawn from the same visual vocabulary.

---

## 2. Where it is weak

These are drawn from the user review corpus and are all documented with
quotations in the full report.

**The handwriting recognizer misreads digits.** The single most cited failure.
Real quotes: *"I wrote 1 and it said I wrote 7"*, *"if I were to write a nine it
would put a six or even a four."* The confusions (1→7, 9→6, 9→4) suggest the
recognizer fires on partial strokes before the child finishes writing. One
Australian reviewer hit a state during the placement test where a wrong answer
**could not be erased and the screen could not be exited** — requiring a full
reinstall.

**It says mean things.** A child reviewer:

> *"it said horrible and I was just offended. They really need to stop saying
> mean stuff to kids when they get it wrong."*

That is an on-screen text label for a wrong answer, delivered to a six-year-old.

**There is no scratch space.** Multiple reviewers ask for somewhere to work a
problem out. There is nowhere.

**There is no story, no world, and no reason to care.** The rewards are
cosmetic and bolted on: you do worksheets, and unrelatedly, a dog gets a hat.
Nothing in the fiction explains why the math matters.

**The paywall precedes the value.** See onboarding above.

**There is no parent dashboard.** Some sources mention "parent monitoring
tools" but no support article or review describes an actual progress view.

### One warning about the research

A second app, **"Math Learner: Fun Brain Games"** (`id6757360456`, by Tilak
Shakya), deliberately mimics the original's branding and dominates search
results for its name. It is *not* a Wildlife Studios product and it is
substantially more modern — named corgi "Cappy", 7 named Worlds, 140 levels, a
sky-themed adventure map, streaks, badges, quests, 14 languages. Much of the
"Math Learner is great" content online is actually about this app. **Do not
conflate them.** Notably, its structure — named worlds, a sky map, an
adventure trail — is the direction the original never took, and is much closer
to what this project builds.

---

## 3. The competitive field

| App | Model | Price | Position |
|---|---|---|---|
| **Khan Academy Kids** | Free, non-profit | $0 | Excellent, broad, genuinely free. The hardest competitor because it costs nothing. |
| **Prodigy Math** | F2P MMO + parent sub | ~$9.99/mo | Real game loop, huge scale. Repeatedly criticised for pressuring kids to nag parents. |
| **DragonBox / Kahoot** | Premium | $5.99–$7.99 one-off | The craft benchmark. Algebra taught wordlessly. Proof that a math game can be beautiful. |
| **Todo Math** | Subscription | ~$4.99/mo | Strong accessibility, strong classroom presence. |
| **ABCmouse / Adventure Academy** | Subscription | ~$12.99/mo | Broad curriculum, enormous marketing spend. |
| **Slice Fractions** | Premium | $3.99 | Narrow, superb, award-winning. |
| **Math Learner (reference)** | Aggressive sub | $9.99/wk | Weakest craft, strongest monetization. |

The lesson of this table is uncomfortable and important: **there is an inverse
correlation between craft and revenue in this category.** DragonBox and Slice
Fractions are the best-made products and monetize once, for pocket change.
Math Learner is the least ambitious and monetizes at $9.99 *per week*.

The opportunity is not to out-drill Math Learner. It is to take
DragonBox-grade craft and attach a monetization model that is honest but not
apologetic.

---

## 4. Pricing evidence

Reference app tiers (US, from paywallscreens.com and review mentions):

- **$9.99/week** (with a 3-day free trial)
- **$24.99/month**
- **$99.99/year**

Prices have moved over time ($7.99 → $9.99, with $11.99/week seen in some A/B
variants). The weekly tier is the aggressive one: a parent who forgets to
cancel pays **$519/year** for a drill app.

Category norms for comparison: Todo Math ~$4.99/mo, Prodigy ~$9.99/mo,
ABCmouse ~$12.99/mo, DragonBox $5.99–7.99 one-off.

---

## 5. Platform revenue reality

This is the section the plan hangs on. The user asked for platforms
**prioritized by actual, real revenue potential**, so the ordering below is
argued, not assumed.

### Market sizes (2025)

| Segment | 2025 | Projection | Source |
|---|---|---|---|
| Educational games for kids (all platforms) | **$12.4B** | $26.8B by 2034, 9.0% CAGR | dataintelo |
| Kids' math learning apps specifically | **$2.3B** | $4.8B by 2035, ~7.5% CAGR | wiseguyreports |
| Educational apps (all types) | **$12.3B** | $54.8B by 2034, 16.2% CAGR | marketintelo |

### iOS — the primary platform

The reference app earns an estimated **$50K/month on iOS alone**, from a
maintenance-mode 2018 codebase with a broken handwriting recognizer. This is
the only hard revenue datapoint in the entire research corpus that is tied to
*this specific product category and this specific audience*, and it is iOS.

iOS also concentrates exactly the buyer this product needs: a parent with an
iPad, a credit card already on file, and a demonstrated willingness to pay a
subscription for their child's education. Family Sharing, Ask to Buy, and the
App Store's Education and Kids editorial surfaces all exist and all favour a
well-crafted premium product. Apple Design Awards have a dedicated
"Social Impact" and "Visuals and Graphics" categories that this category can
legitimately win.

### Android — second, and cheap to reach

Android's per-user monetization in kids' education is materially lower than
iOS, and Google Play's Families policy adds real compliance burden (Teacher
Approved programme, Designed for Families, stricter ads/data rules). But:

- The reference app **is not there at all**. The 404 is an open lane.
- Volume is far larger, especially outside North America.
- If the codebase is already cross-platform, the incremental cost to ship is
  small — it is store compliance work, not engineering work.

That last point is why Android is second rather than third. It is not that
Android is lucrative; it is that it is nearly free given the architecture
chosen in PLAN.md.

### Windows Store — third, low expectations

The Microsoft Store's consumer education category is thin. Discovery for a
kids' app is poor, the installed base of Windows tablets in the hands of
5–8-year-olds is small, and there is no equivalent of the App Store Kids
editorial surface. It is worth shipping because MSIX packaging from an existing
web build is a day of work and there is no competition, not because it will
move the revenue line.

### Steam — fourth, and honestly, a marketing channel not a revenue channel

I want to be blunt here because the user asked for real revenue potential.
Steam's audience for a 5-to-8-year-old's math game is **very small**. Steam
skews teen-to-adult, its discovery algorithm is built around wishlists and
genre tags that this product does not fit, and there is no curated "Educational
Kids" surface for parents to browse. Educational children's titles on Steam
routinely see minimal unit counts. Subscription and IAP models are rare there;
it is a one-off-purchase storefront.

Steam's real value to this project is different and worth stating:

- It is the only platform where a **premium, no-subscription, no-ads** version
  can be sold to the exact parent who is angry about $9.99/week — and that
  parent is vocal, and reviews there are long-form and searchable.
- Steam Deck and living-room play are a genuinely novel context for this genre.
- A Steam page is free press-kit hosting and gives the project a "real game"
  legitimacy signal that helps with Apple editorial.

Ship it. Do not forecast from it.

### Conclusion

**iOS → Android → Windows Store → Steam.**

The unusual thing about this ordering is that the gap between #1 and #4 is not
a factor of two, it is closer to a factor of fifty. The plan therefore treats
iOS as the product and everything else as distribution.

---

## 6. What this research licenses us to build

Reading the whole corpus, the reference app's $50K/month comes from four things
that have nothing to do with quality: a keyword-perfect name, an aggressive
weekly paywall placed before value, a 2018-era ASO advantage compounded over
seven years, and 120,976 ratings of social proof.

Its craft is not an asset. Its craft is its liability, and every one of its
weaknesses maps to something a careful team can simply do better:

| Their weakness | Our answer |
|---|---|
| Handwriting recognition that misreads digits | **Do not ship handwriting recognition.** Tap and drag are reliable. Frustration at the input layer poisons the math. |
| *"it said horrible"* | Never evaluate the child. Evaluate the answer, warmly, and move on. |
| No story; rewards are a dog in a hat | A world where **the math is the mechanic** — see GAME-DESIGN.md. |
| Drills with no meaning | Constellations that *are* fact families. Lighting a star is answering; the picture that emerges is the structure of the number. |
| Paywall at 90 seconds | Give away a real, complete, satisfying first chapter. |
| No parent view | A parent report that shows genuine diagnostic detail, gated behind a real multiplication word problem. |
| Generic art | A single coherent art direction — warm night, hand-rigged character, everything drawn in code, no stock assets. |

And one number worth keeping in view: **270 MB**. The reference app ships a
quarter of a gigabyte of raster assets. PIPKIN's entire build is ~67 KB of
JavaScript (23 KB gzipped) with every visual and every sound generated
procedurally. That is not a vanity metric — it is what makes shipping to four
platforms from one codebase tractable.

---

## 7. Method notes (useful for future research)

- `https://itunes.apple.com/lookup?id=<appid>&country=us` is anonymous, returns
  clean JSON metadata including full-resolution screenshot URLs, rating counts,
  version, and size. Far better than scraping the HTML page.
- Apple's screenshot CDN URLs resize by swapping the trailing `NNNxNNNbb.jpg`
  segment.
- Wildlife Studios' Zendesk (`wildlifestudios8986.zendesk.com`) is the single
  best source on game mechanics — the points thresholds, daily goal tiers, and
  the exact gift schedule all come from support articles, not marketing.
- Non-US App Store listings for the same app ID carry **different marketing
  copy**. The "Japanese methodology" claim survives in CA/AU/IN but was removed
  from the US listing — comparing storefronts surfaced a claim that would
  otherwise be invisible.
- Screenshots are worth downloading and *looking at* rather than reading
  descriptions of. Several structural facts (the ladder layout, the arena's
  point ticker, the ten-frame) came only from direct inspection.

## 8. Known gaps

Honest list of what is still unconfirmed:

1. The home screen's exact visual rendering (list vs. grid) is inferred from
   support docs, not seen.
2. The number of Books is unconfirmed; 8–15 is an estimate.
3. "Multiplication Splash" is a name with no description attached.
4. The app's typeface was not identified.
5. Audio is essentially undocumented — no reviewer describes the music or SFX.
6. Why the Android listing 404s (removed vs. renamed) is unknown.
7. Whether a parent dashboard exists in any form.
8. Exact dates of the price changes.
