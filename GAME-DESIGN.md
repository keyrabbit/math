# PIPKIN — Game Design Document

> A math game for ages 5–11 where **every number fact you master lights a star**.

---

## 1. The insight this game is built on

The reference app (*Math Learner*, Wildlife Studios) has one genuinely excellent idea buried
inside otherwise ordinary drill content. Its "Proven Learning Methodology" screen shows a
**vertical ladder of a fact family**:

```
8 − 1 = 7  ✓   (faded, done)
8 − 2 = 6  ✓   (faded, done)
8 − 3 = ▢      (large, active, centered)
8 − 4 =        (faded, upcoming)
8 − 5 =        (faded, upcoming)
```

That is not a random drill. It is a **structured family of related facts**, presented so the
child *sees the pattern* — as one number goes up, the answer goes down. This is how number
sense is actually built (number bonds / fact families are the core of Singapore Math, Math
Recovery, and Common Core's operations-and-algebraic-thinking strand).

But the app throws that insight away everywhere else: the ladder is just a UI, disconnected from
any world, any reward, any meaning. You solve it, you get points, you move on.

**Pipkin's core design decision: make the fact family the story.**

> Every number has a constellation. The constellation for **8** has stars for every way to make
> 8. When you solve `5 + 3 = 8`, a star lights. When you have found all the ways to make 8, the
> **Eight** constellation is complete and rises into the night sky forever.

Now the ladder isn't a worksheet — it's *astronomy*. The child isn't answering questions, they're
**relighting the sky**. Mastery is visible, permanent, and beautiful: a Star Atlas that fills up
over months. That is a reason to come back tomorrow that no points counter can buy.

---

## 2. Premise & story

The night sky used to be full of **counting-stars** — the stars people used to learn numbers by.
One night they fell, scattering across the land as tiny sparks called **pips**.

You meet a **Pipkin**: a small, curious creature made of light, who is missing most of its own
glow. Together you travel the valley — meadow, harbour, orchard, canyon, and finally the old
observatory — gathering pips and relighting the constellations one number at a time.

As the Pipkin gathers pips it visibly **grows brighter and larger**, gaining new expressions and
abilities. The sky above the world map fills in as you progress. By the end of the journey the
child has, without ever being told they were doing worksheets, mastered addition, subtraction,
multiplication, division and fractions — and has a night sky they built themselves.

**Why this works commercially:** parents buy *outcomes* and *calm*. A visible, permanent Star
Atlas is a progress report a parent can actually read ("she's lit every constellation up to 12").
Kids stay for the creature and the sky.

**Why it's ownable:** "pip" is already the word for the dots on dice and dominoes — the original
manipulative for subitizing. The mascot is literally made of the maths.

---

## 3. Art direction

Deliberately **not** the reference app's flat, bright, thick-outline cartoon style (which is
competent but generic — it looks like every other kids' app on the store). Pipkin goes for
**"warm night"**: a premium, illustrated, glow-lit look closer to *Alto's Odyssey*, *Gris*, or
*Sky*, but soft and friendly rather than melancholy.

| Element | Direction |
|---|---|
| **Palette** | Deep indigo → plum night skies, with warm ember/amber light sources. Each biome shifts the palette (dawn meadow = peach/rose; harbour = teal/dusk; orchard = amber/sunset; canyon = violet/dust; observatory = deep indigo/starlight). |
| **Shapes** | Soft geometric silhouettes. Layered parallax hills, no outlines, no drop shadows — depth comes from **atmospheric perspective** (distant layers desaturate toward the sky colour). |
| **Light** | Everything meaningful glows. Correct answers emit light. The Pipkin is a light source that actually illuminates nearby scenery. |
| **Texture** | Subtle film grain over the whole frame + soft vignette. This single detail is what separates "web page" from "game". |
| **Type** | A friendly geometric rounded sans for UI; **tabular numerals everywhere** so digits never jitter in counters and equations. Numerals are the hero — large, confident, generously spaced. |
| **Motion** | Spring physics, not CSS easing, for anything the child touches. Squash-and-stretch on the Pipkin. Anticipation before every big move. |

### The Pipkin is a rigged puppet, not a picture

The mascot is **procedurally drawn and skeletally animated in code** — body, ears, eyes, pupils,
brows, cheeks, and a trailing set of orbiting pips, each on its own spring. This means it can:

- **breathe** continuously (idle animation — never a static image)
- **blink** on a natural random cadence
- **look at** whatever the child is touching (pupils track the pointer/touch)
- **squash and stretch** when it hops, lands, or reacts
- **react** with distinct emotional states: idle, curious, thinking, delighted, encouraging
- **grow** across the game as its pip count rises

A static PNG mascot, however beautifully illustrated, cannot do any of this. This is the one area
where building in code beats buying art — and it's the difference between a mascot and a
character the child believes is alive.

---

## 4. Game modes (the "5000+ exercises" problem, solved properly)

The reference claims *5000+ exercises*. Hand-authoring that is a content-farm approach. Pipkin
generates them **procedurally from skill templates**, so the space is effectively unbounded, while
a curriculum layer controls exactly which templates are legal at which stage. Five distinct
interaction modes keep it from ever feeling like one worksheet:

| # | Mode | Interaction | Teaches |
|---|---|---|---|
| 1 | **Constellation** | The fact-family ladder, reimagined. Solved facts fly up and light a star in the constellation being built on screen. | Number bonds, fact families, pattern recognition |
| 2 | **Pip Frames** | Drag glowing pips into ten-frames to build a quantity. *Manipulative*, not multiple choice — the child composes the answer physically. | Subitizing, place value, composing/decomposing |
| 3 | **Balance** | A physical scale beam. Drag expression tiles onto each pan; the beam tips with real spring physics and only settles level when both sides are equal. | Equivalence, the meaning of `=` (the single most misunderstood symbol in primary maths) |
| 4 | **Star Bridge** | Choose the tile that continues a sequence to build a bridge the Pipkin walks across. Wrong tile = the plank fades and it tries again — never a fall, never a punishment. | Skip counting, times tables, patterns |
| 5 | **Meteor Shower** | Timed fluency arcade round. Falling meteors carry expressions; catch the ones matching the target. | Automaticity / fact fluency under light time pressure |

**Deliberate omission — handwriting recognition.** The reference app's signature feature is also
the single most-complained-about thing in its reviews ("I wrote 1 and it said I wrote 7"). Pipkin
ships a large, tactile, **custom numeric keypad** with satisfying press physics instead. Digit
recognition is a *Phase 2 enhancement* to be added only once it can be proven accurate on real
children's handwriting — never as a mandatory input path. (See `PLAN.md` and the repo issue.)

---

## 5. Progression & the Star Atlas

- **Pips** are earned for correct work and are purely a *narrative* resource — they feed the
  Pipkin's glow and light constellations. They are never sold, never spent on power, and never
  withheld to force a purchase.
- **Constellations** are the mastery unit. Each corresponds to a number and its fact family.
  A constellation is only complete when the child has demonstrated the whole family — not once,
  but on a **spaced-repetition schedule**, so completion means retention rather than a lucky day.
- **The Star Atlas** is the collection/progress screen: a beautiful sky the child fills in. It
  doubles as the parent-facing progress report.
- **Chapters/biomes** unlock as constellations complete, gating new operations in a sensible
  scope-and-sequence (see §7).

## 6. Feel: the rules this build holds itself to

Drawn from the design-engineering principles in `docs/CRAFT.md`:

- Nothing animates from `scale(0)`; entrances start at `0.95` with opacity.
- Anything the child presses gets **instant** feedback (<100 ms) with a physical scale-down.
- UI transitions stay under 300 ms; only *celebrations* are allowed to be slow.
- `ease-out` (custom curve) for entrances; springs for anything draggable or interruptible.
- Only `transform` and `opacity` animate in the DOM layer; everything richer happens on canvas.
- **Wrong answers are never punished with red, buzzers, or negative words.** The reference app was
  called out in reviews for telling children they were "horrible". Pipkin's failure state is a
  gentle dim-and-retry, and the copy always assumes the child is mid-thought, not wrong.
- `prefers-reduced-motion` is respected: parallax, screen movement and particle bursts reduce to
  gentle opacity changes, while feedback-critical motion remains.
- Full keyboard support and screen-reader labels on every interactive element from day one — an
  Apple Design Award has an accessibility bar, and kids' apps are used by kids with disabilities.

## 7. Curriculum scope & sequence (v1, US Common Core-aligned)

| Chapter | Biome | Operations unlocked | Constellations |
|---|---|---|---|
| 1 | Meadow | Counting, number bonds to 10 | 1–10 |
| 2 | Harbour | Addition & subtraction within 20 | 11–20 |
| 3 | Orchard | Multiplication (2,5,10 then 3,4,6–9) | ×tables as star clusters |
| 4 | Canyon | Division as the inverse of multiplication | ÷ families |
| 5 | Observatory | Fractions: halves → equivalence | fraction constellations |

## 8. What the MVP in this repo proves

The MVP is not a slide deck — it is a **playable, polished vertical slice** demonstrating the art
direction, the rigged character, the spring-physics feel, the audio, and at least the
Constellation and Pip Frames modes end to end, with the Star Atlas persisting between sessions.
If the vertical slice does not feel like a real game in the first ten seconds, the concept has not
been proven and the rest of the plan is worthless.
