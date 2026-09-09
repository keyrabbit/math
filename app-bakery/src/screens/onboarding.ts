import { audio } from "../core/audio";
import { el, setChildren, stagger, wait } from "../core/dom";
import { ticker } from "../core/ticker";
import { ShelfView } from "../render/shelf";
import type { ScreenInstance, World } from "../world";
import { buildRecipe, opSymbol } from "../game/curriculum";
import { store } from "../game/store";
import { makeMapScreen } from "./map";

type Step = "story" | "meet" | "firstBake" | "age" | "ready";

/**
 * Onboarding.
 *
 * Deliberately **not** a settings form. The industry-standard kids-app onboarding — name field, age
 * dropdown, notification prompt, paywall — asks a five-year-old to do paperwork before they have
 * been given a reason to care.
 *
 * Instead this is a short cinematic that hands over control as fast as possible: two story beats,
 * then a real (trivially easy) exercise that bakes the child's first treat inside the first thirty
 * seconds. The one piece of configuration we genuinely need — rough age, to pick a starting
 * chapter — is asked *after* the child has already succeeded at something, when they have a reason
 * to answer.
 */
export function makeOnboardingScreen(world: World): ScreenInstance {
  let step: Step = "story";
  const firstRecipe = buildRecipe("bond", 5);
  const view = new ShelfView();
  let showShelf = false;

  const stage = el("div", { class: "ob__stage" });
  /**
   * Reserved space for the character. Crumb is drawn on the canvas, so the only way to keep it from
   * landing on the copy is to give it a real box in the DOM layout and read that box back. The
   * sibling MVP positioned its character at a fixed fraction of the viewport height and the
   * headline printed straight across its face.
   */
  const figure = el("div", { class: "ob__figure", aria: { hidden: "true" } });
  const root = el("div", { class: "ob" }, figure, stage);

  let removeTick: (() => void) | null = null;
  let removeLayer: (() => void) | null = null;

  // ------------------------------------------------------------------ steps

  function renderStory(): void {
    setChildren(stage, 
      el(
        "div",
        { class: "ob__beat center" },
        el("h1", { class: "headline ob__line", textContent: "It's opening day at the bakery." }),
        el("p", {
          class: "ob__line ob__line--2 dim",
          textContent: "The oven is warm. The shelves are completely empty.",
        }),
        el("button", {
          class: "btn btn--primary btn--large ob__line ob__line--3",
          type: "button",
          textContent: "Who works here?",
          on: {
            click: () => {
              audio.select();
              step = "meet";
              render();
            },
          },
        })
      )
    );
    world.crumb.setMood("sleepy");
  }

  function renderMeet(): void {
    setChildren(stage, 
      el(
        "div",
        { class: "ob__beat center" },
        el("h1", { class: "headline ob__line", textContent: "This is Crumb." }),
        el("p", {
          class: "ob__line ob__line--2 dim",
          textContent:
            "Crumb knows every recipe by heart — but a recipe only works if the numbers are right. Get a number right and something lovely comes out of the oven.",
        }),
        el("button", {
          class: "btn btn--primary btn--large ob__line ob__line--3",
          type: "button",
          textContent: "Help Crumb bake",
          on: {
            click: () => {
              audio.select();
              step = "firstBake";
              render();
            },
          },
        })
      )
    );
    world.crumb.setMood("curious");
    world.crumb.sprinkleCount = 1;
    setTimeout(() => world.crumb.hop(24), 400);
  }

  /**
   * The first exercise. Deliberately the *easiest* fact in the family — the purpose of this moment
   * is to teach the interaction, not to assess the child.
   *
   * The fact is chosen explicitly rather than taken from the end of the list, and every part of the
   * question — the operator symbol included — is derived from the fact object. The sibling MVP
   * shipped a bug here where it took the last fact (a subtraction) and rendered it with a hard-coded
   * "+", producing an unsolvable first question. Nothing else in the app can recover from getting
   * this screen wrong.
   */
  function renderFirstBake(): void {
    showShelf = true;
    const fact =
      firstRecipe.facts.find((f) => f.op === "add" && Math.min(f.a, f.b) === 1) ??
      firstRecipe.facts[0];
    const slot = el("span", { class: "slot", dataset: { empty: "1" } });

    const tiles = el("div", { class: "tiles ob__tiles" });
    const options = shuffle([fact.answer, fact.answer + 1, Math.max(1, fact.answer - 2)]);
    let done = false;

    for (const value of options) {
      const tile = el("button", {
        class: "tile",
        type: "button",
        textContent: String(value),
        aria: { label: String(value) },
        on: {
          click: async () => {
            if (done) return;
            const rect = tile.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            if (value === fact.answer) {
              done = true;
              tile.dataset.status = "correct";
              slot.textContent = String(value);
              slot.dataset.empty = "0";
              slot.dataset.status = "correct";
              world.reward(cx, cy, 1);
              world.crumb.sprinkleCount = 4;
              store.mastery.record(fact.id, true, 1200);
              view.sync(store.mastery);
              audio.treatBaked(0);
              store.addSprinkles(5);
              await wait(1100);
              step = "age";
              render();
            } else {
              tile.dataset.status = "retry";
              world.softMiss();
              setTimeout(() => delete tile.dataset.status, 700);
            }
          },
        },
      });
      tiles.appendChild(tile);
    }

    setChildren(stage, 
      el(
        "div",
        { class: "ob__beat center" },
        el("p", { class: "prompt", textContent: "Tap the number that finishes the recipe" }),
        el(
          "div",
          { class: "ladder__row ob__equation", dataset: { role: "active" } },
          `${fact.a} ${opSymbol(fact.op)} ${fact.b} =`,
          slot
        ),
        stagger(tiles)
      )
    );
  }

  function renderAge(): void {
    const bands: { id: "5-6" | "7-8" | "9-11"; label: string; note: string; chapter: number }[] = [
      { id: "5-6", label: "5 – 6", note: "Counting and numbers to 10", chapter: 0 },
      { id: "7-8", label: "7 – 8", note: "Adding and taking away to 20", chapter: 1 },
      { id: "9-11", label: "9 – 11", note: "Times tables and sharing", chapter: 2 },
    ];

    const choices = el("div", { class: "ob__choices" });
    for (const band of bands) {
      choices.appendChild(
        el(
          "button",
          {
            class: "ob__choice card",
            type: "button",
            aria: { label: `${band.label} years old. ${band.note}` },
            on: {
              click: () => {
                audio.select();
                store.update({
                  ageBand: band.id,
                  chapter: band.chapter,
                  unlockedChapter: Math.max(store.state.unlockedChapter, band.chapter),
                  onboarded: true,
                });
                step = "ready";
                render();
              },
            },
          },
          el("span", { class: "ob__choiceLabel", textContent: band.label }),
          el("span", { class: "ob__choiceNote dim", textContent: band.note })
        )
      );
    }

    setChildren(stage, 
      el(
        "div",
        { class: "ob__beat center" },
        el("h1", { class: "headline", textContent: "You baked your first treat." }),
        el("p", {
          class: "dim",
          textContent:
            "How old is the baker? This just picks where to start — you can change it any time.",
        }),
        stagger(choices)
      )
    );
    world.crumb.setMood("proud");
  }

  function renderReady(): void {
    setChildren(stage, 
      el(
        "div",
        { class: "ob__beat center" },
        el("h1", { class: "headline", textContent: "The bakery is open." }),
        el("p", {
          class: "dim",
          textContent: "Finish a whole recipe and its shelf stays in your case for good.",
        }),
        el("button", {
          class: "btn btn--primary btn--large",
          type: "button",
          textContent: "Put on the apron",
          on: {
            click: () => {
              audio.select();
              store.update({ onboarded: true });
              void world.go(makeMapScreen);
            },
          },
        })
      )
    );
    world.crumb.setMood("delighted");
  }

  function render(): void {
    switch (step) {
      case "story":
        renderStory();
        break;
      case "meet":
        renderMeet();
        break;
      case "firstBake":
        renderFirstBake();
        break;
      case "age":
        renderAge();
        break;
      case "ready":
        renderReady();
        break;
    }
  }

  return {
    element: root,
    mounted() {
      world.showCrumb = true;
      world.setRoom("kitchen");
      world.crumb.sprinkleCount = 0;
      view.setRecipe(firstRecipe, store.mastery);
      render();

      removeLayer = world.stage.add((c) => {
        if (!showShelf) return;
        const r = figure.getBoundingClientRect();
        // Sit the shelf in the upper part of the reserved band, leaving the lower-left corner free
        // for the character.
        const size = Math.min(r.width * 0.82, r.height * 0.82);
        view.draw(c.ctx, {
          x: r.left + (r.width - size) / 2,
          y: r.top + (r.height - size) * 0.32,
          w: size,
          h: size,
        });
        view.update(c.dt);
      }, 10);

      removeTick = ticker.add((_, elapsed) => {
        const r = figure.getBoundingClientRect();
        const bob = Math.sin(elapsed * 0.6);
        if (step === "firstBake") {
          // The shelf owns the band now, so Crumb steps down into its bottom-left corner — still
          // present, no longer competing with the thing being explained.
          world.crumb.setScale(0.5);
          world.crumb.moveTo(
            r.left + Math.min(r.width * 0.18, 76),
            r.bottom - world.crumb.bottomExtent - 4 + bob * 4
          );
        } else {
          // Scale to fit the reserved band, then stand the character *on* the band's lower edge.
          // Positioning by the anchor alone put the headline straight across its face.
          world.crumb.setScale(Math.min(1.05, (r.height * 0.94) / 210));
          world.crumb.moveTo(r.left + r.width / 2, r.bottom - world.crumb.bottomExtent + bob * 5);
        }
      });
    },
    destroy() {
      removeLayer?.();
      removeTick?.();
    },
  };
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
