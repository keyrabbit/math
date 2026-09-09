# CRUMB'S BAKERY — Game Design Document

> A math game for ages 5–11 where **every number fact you master bakes a treat**.

> **This is a second, parallel MVP.** It shares the engine, pedagogy and craft rules of
> [`GAME-DESIGN.md`](GAME-DESIGN.md) (Pipkin / the night sky) but replaces the entire narrative
> layer. Pipkin lives in [`app/`](app/); Crumb lives in [`app-bakery/`](app-bakery/). Neither
> replaces the other — they exist so the same core loop can be judged against two different
> stories with the same production values.

---

## 1. Why this exists

Pipkin's premise is *fallen counting-stars, pips, constellations and an observatory*. It is
beautiful, and playtest feedback from the target age was blunt: **a five-year-old does not have
the concepts.** "Constellation", "the sky used to be full of stars people learned numbers by",
"relight the valley" — every one of those is an abstraction sitting on top of another
abstraction. The child has to learn the *story* before the story can help them learn the *maths*.

Crumb's Bakery keeps the exact same pedagogical machine and swaps in a premise a five-year-old
already owns completely:

| | Pipkin | Crumb |
|---|---|---|
| Premise | The counting-stars fell from the sky | The bakery is open and the shelves are empty |
| Verb | Relight a star | Bake a treat |
| Mastery unit | A constellation | A recipe (a tray of treats) |
| Collection | The Star Atlas | The Bakery Case |
| Forgetting | A star fades | A treat goes stale |
| Re-mastery | The star is sealed | The treat becomes a **house special** |
| Currency | Pips | Sprinkles |
| Places | Meadow, harbour, orchard, canyon, observatory | The Little Kitchen, The Pantry, The Morning Market, The Bakehouse, The Party Room |

Every one of those right-hand terms is a thing a five-year-old can point at in real life. That is
the whole thesis: **the metaphor should cost the child nothing.**

---

## 2. Premise & story

It is **opening day**. The oven is warm. The shelves are completely empty.

You meet **Crumb** — a small round baker in a chef's toque who is very keen and cannot count.
Together you work through the order board: every order is a number, and every number has a
**recipe**. The recipe for **5** is every way to make 5. Solve `2 + 3 = 5` and a treat comes out
of the oven and goes on the shelf. Fill the shelf and the recipe is finished, and it goes into
**the Bakery Case** — the glass display at the front of the shop, which is never emptied.

Come back tomorrow and some treats have gone **stale**. That isn't a punishment, it is the
mechanic: stale treats need re-baking, and a treat you bake back from stale becomes a **house
special** with a gold gleam. The child is not being tested on retention, they are running a
shop that has to be restocked.

**Why this works commercially:** it is legible on a store screenshot in one second, and the
parent-facing progress report ("she has finished every recipe up to 12") needs no explanation.

**Why it's ownable:** the shop metaphor makes the *spaced-repetition schedule itself* diegetic.
Most educational apps hide their review scheduler behind a streak counter. Here the scheduler
*is* the game: stock goes stale, and restocking is the loop.

---

## 3. Art direction

The single biggest decision was **not** to make this a bright daytime bakery. Pipkin's entire
lighting architecture — glow-based rendering, additive composite blends, atmospheric perspective,
film grain, vignette — is what makes it look like a game rather than a web page. A flat, bright,
high-key bakery would have thrown all of that away and landed exactly on the generic kids'-app
look the project is trying to avoid.

Instead the room is lit like an **oven at night**: a dark warm interior with one strong amber
light source. Same engine, same craft, different genre.

| Element | Direction |
|---|---|
| **Palette** | Deep roast-brown walls (`#150a06` → `#63351f`) with an amber oven-glow horizon. Each room shifts it (kitchen = warm butter; pantry = darker, cooler shelves; market = dawn peach; bakehouse = ember red; party room = pink sugar). |
| **Shapes** | Silhouetted shelf planks carrying jars, bowls, bottles and tins. Dead-flat horizontals — see §3.1. |
| **Light** | Every baked treat is a light source. A finished treat lights the plank under it. Crumb glows faintly. |
| **Texture** | Same film grain + vignette as Pipkin. Rising **flour motes** replace stars in the air. |
| **Type** | Baloo 2 for headings, Nunito for UI. Tabular numerals everywhere. |
| **Motion** | Springs, not easing. Crumb's toque is on its **own** spring so it lags his head. |

### 3.1 The battlement problem

Worth recording because it took three passes. The backdrop silhouette started as *stepped
flat-topped runs* — the direct translation of Pipkin's rolling hills into something rectilinear.
It read unmistakably as **castle battlements**, in every single screenshot. Widening the runs
didn't fix it. Reducing to two height steps didn't fix it.

The actual cause: crenellation *is* a regular up-down at constant amplitude, so any stepped
horizon at a fixed step height reads as a castle no matter how the widths are tuned. The fix was
to delete the steps entirely — **each plank is one dead-flat horizontal**, and all silhouette
interest comes from varied crockery standing on it (jars with lids, wide shallow bowls, tall
narrow bottles, short knobbed tins). Long horizontals broken by objects of different heights is
what shelving actually looks like.

### 3.2 Crumb is a rigged puppet, not a picture

Same rig as the Pipkin — body, ears, eyes, pupils, brows, cheeks, all on individual springs, so
he breathes, blinks, tracks the pointer, squashes on landing and has distinct moods. The bakery
additions:

- a **chef's toque** on its own spring, so it wobbles a beat behind the head
- an **apron** — which required a real fix: a one-circle character has no shoulders, so neck
  straps drawn from the bib to the top of the head land *across the face* and read as red
  slashes. Replaced with a bib top-edge trim line.
- tumbling **sprinkle capsules** orbiting him instead of pips

---

## 4. Game modes

Identical procedural-generation approach to Pipkin — templates, not a hand-authored bank — with
the interactions re-skinned to the shop:

| # | Mode | Interaction | Teaches |
|---|---|---|---|
| 1 | **Recipe Card** | The fact-family ladder. Solved facts bake a treat onto the shelf grid. | Number bonds, fact families, pattern recognition |
| 2 | **Tray Frames** | Drag buns into a ten-hole baking tray to build a quantity. Manipulative, not multiple choice. | Subitizing, place value, composing/decomposing |
| 3 | **Balance** | A kitchen scale. Both pans must settle level. | Equivalence, the meaning of `=` |
| 4 | **Order Line** | Choose the tile that continues a sequence to fill the next order in the queue. | Skip counting, times tables, patterns |
| 5 | **Rush Hour** | Timed fluency round — orders arrive faster than you can read them. | Automaticity / fact fluency |

Only mode 1 is built in this MVP, same as Pipkin.

**Deliberate omission — handwriting recognition.** Unchanged from `GAME-DESIGN.md` §4: a large
tactile numeric keypad with press physics, never a mandatory recognition path.

---

## 5. Progression & the Bakery Case

- **Sprinkles** are earned for correct work and are purely narrative. Never sold, never spent on
  power, never withheld to force a purchase.
- **Recipes** are the mastery unit. A recipe is complete only when the whole fact family has been
  demonstrated on a **spaced-repetition schedule** — so "finished" means retained.
- **The shelf is a grid, not a spiral.** Pipkin laid its stars out on a seeded spiral, which is
  pretty but arbitrary. The bakery shelf places a fact family's **additions directly above the
  subtractions that undo them**, so the inverse relationship is visible in the layout itself.
  Columns: ≤4 facts → one row; ≤6 → 3 columns; ≤8 → 4; otherwise 5.
- **The Bakery Case** is the collection screen. Nothing in it is ever taken away.
- **Rooms** unlock as recipes finish, gating operations in scope-and-sequence order (§7).

### The freshness model

This is the spaced-repetition scheduler, made visible. Intervals are unchanged from Pipkin.

| State | Meaning | Look |
|---|---|---|
| **unbaked** | never answered correctly | dashed ghost outline on the plank |
| **fresh** | correct, within the hold interval | fully drawn, glowing, lighting the plank |
| **stale** | hold interval elapsed — due for review | desaturated, sprinkles fade first |
| **house special** | re-baked after going stale | gold gleam; the retention proof |

A treat's shape is derived from the recipe name, so "Sugar Cookies" are plated as cookies and
"Morning Buns" as buns. (An early build seeded the shape randomly and put buns on the cookie
tray — a small thing that instantly breaks the fiction for a child who *can* read the name.)

---

## 6. Feel: the rules this build holds itself to

Unchanged from [`GAME-DESIGN.md`](GAME-DESIGN.md) §6, and worth restating because they are the
reason this is a second *craft-equivalent* MVP rather than a reskin:

- Nothing animates from `scale(0)`; entrances start at `0.95` with opacity.
- Presses get feedback in <100 ms with a physical scale-down.
- UI transitions under 300 ms; only celebrations may be slow.
- Springs for anything draggable or interruptible; custom ease-out for entrances.
- Only `transform` and `opacity` animate in the DOM layer; everything richer is on canvas.
- **Wrong answers are never punished with red, buzzers, or negative words.** In the bakery the
  failure state is "that one needs another minute in the oven".
- `prefers-reduced-motion` is respected.
- The canvas is `aria-hidden`; **every piece of meaning on it is mirrored in the DOM** with
  labels, so the whole game is playable by keyboard and legible to a screen reader.

---

## 7. Curriculum scope & sequence (v1, US Common Core-aligned)

| Chapter | Room | Operations unlocked | Recipes |
|---|---|---|---|
| 1 | The Little Kitchen | Counting, number bonds to 10 | 5–10 |
| 2 | The Pantry | Addition & subtraction within 20 | 11–20 |
| 3 | The Morning Market | Multiplication (2,5,10 then 3,4,6–9) | ×tables as trays |
| 4 | The Bakehouse | Division as the inverse of multiplication | ÷ families |
| 5 | The Party Room | Fractions: halves → equivalence | fraction recipes |

33 recipes, 356 treats in total.

---

## 8. What this MVP proves

That the pedagogy, the engine and the craft bar are **separable from the story**. The curriculum
layer, the mastery scheduler, the spring rig, the canvas world and the screen architecture came
across essentially unchanged; what changed was the metaphor sitting on top of them. That is the
evidence needed before spending real money on art direction for one narrative: the expensive part
of this build is not the theme.

It also answers the narrower question the theme was rebuilt to answer — **can a five-year-old
hold the premise without being taught it first?** "The shelves are empty, let's bake" needs no
teaching. "The counting-stars fell" does.

---

## 9. Should there be a theme picker?

Not yet, and deliberately. Shipping both stories as a selectable option doubles the art,
copy, QA and localisation surface forever in exchange for a preference nobody has asked for.
The architecture now demonstrably supports multiple themes; that option should be held until
there is evidence a real child bounces off one and engages with the other. Build for many,
**ship one.**
