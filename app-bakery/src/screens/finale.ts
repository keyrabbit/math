import { audio } from "../core/audio";
import { el } from "../core/dom";
import { ticker } from "../core/ticker";
import type { ScreenInstance, World } from "../world";
import { CHAPTERS } from "../game/curriculum";
import { store } from "../game/store";
import { unlockedDecor } from "../game/decor";
import { makeMapScreen } from "./map";

/** How long each line of the curtain call waits before the next one arrives. */
const BEAT_MS = 1250;

/**
 * The ending.
 *
 * Every recipe in the game is roughly five hundred questions and several weeks of real evenings,
 * and until now the reward for all of it was a summary panel with different words on it. That is
 * the single largest thing the honest review got right: a game that asks a child for that much
 * work owes them a moment at the end that is unlike any other moment in it.
 *
 * So this screen breaks its own rules on purpose, and is the only place that does:
 *
 *  - **It is the only night room.** The lamps go out, the oven stays lit, and every decoration the
 *    child bought is standing in it. A child who spent sprinkles on a cat in week two should see
 *    the cat here.
 *  - **It is the only screen that counts.** The whole game deliberately refuses to show a score,
 *    because a score is a thing you can fail. At the end there is nothing left to fail, so the
 *    numbers finally come out — and they are the child's real ones, read back off the save: how
 *    many they answered, how many they got right, their quickest ever answer, how many days they
 *    kept coming back.
 *  - **It is the only screen that takes its time.** Lines arrive one at a time, a beat apart, with
 *    a small pop of sprinkles on each. That pacing is the reward.
 *
 * And because a seven-year-old will not sit through anything they did not choose, a tap anywhere
 * drops the whole curtain call at once. Ceremony that cannot be skipped stops being ceremony and
 * becomes a loading screen.
 */
export function makeFinaleScreen(world: World): ScreenInstance {
  const life = store.mastery.lifetime();
  const days = Object.keys(store.state.playSeconds ?? {}).length;
  const seconds = Object.values(store.state.playSeconds ?? {}).reduce((a, b) => a + b, 0);
  const decor = unlockedDecor(store.state.sprinkles);
  const name = store.state.name.trim();

  /** A line of the curtain call: the big number, and the sentence it lives in. */
  const beats: { value: string; label: string }[] = [
    { value: String(life.baked), label: "treats baked" },
    { value: String(life.answers), label: "questions answered" },
    // Only worth a line of its own when there is something to compare it with. A child who never
    // got one wrong would otherwise read the same number twice and assume the screen was broken.
    ...(life.right < life.answers ? [{ value: String(life.right), label: "of them right" }] : []),
    ...(life.fastestMs > 0
      ? [{ value: `${(life.fastestMs / 1000).toFixed(1)}s`, label: "your quickest answer ever" }]
      : []),
    ...(life.bestStreak > 1
      ? [{ value: String(life.bestStreak), label: "right in a row, at your best" }]
      : []),
    ...(days > 1 ? [{ value: String(days), label: "days you came back" }] : []),
    ...(seconds >= 300
      ? [{ value: clockText(seconds), label: "spent baking with Crumb" }]
      : []),
  ];

  const beatNodes = beats.map((b) =>
    el(
      "li",
      { class: "finale__beat" },
      el("span", { class: "finale__beatValue", textContent: b.value }),
      el("span", { class: "finale__beatLabel", textContent: b.label })
    )
  );

  const rooms = el(
    "ul",
    { class: "finale__rooms" },
    ...CHAPTERS.map((c) => el("li", { class: "finale__room", textContent: c.title }))
  );

  const sign = el(
    "div",
    { class: "finale__sign" },
    el("p", {
      class: "finale__signLine",
      textContent:
        decor.length > 0
          ? `Every shelf is full, the ${decor[decor.length - 1].name.toLowerCase()} is where you put it, and the oven is warm for the morning.`
          : "Every shelf is full, and the oven is warm for the morning.",
    }),
    el("p", {
      class: "finale__signOff",
      textContent: name ? `Thank you for baking with me, ${name}.` : "Thank you for baking with me.",
    }),
    el("p", { class: "finale__signName", textContent: "— Crumb" })
  );

  const done = el("button", {
    class: "btn btn--primary btn--large finale__done",
    type: "button",
    textContent: "Back to the bakery",
    on: {
      click: () => {
        audio.select();
        void world.go(makeMapScreen);
      },
    },
  });

  const stack = el(
    "div",
    { class: "finale__stack" },
    el("ul", { class: "finale__beats" }, ...beatNodes),
    rooms,
    sign,
    el("div", { class: "finale__actions row" }, done)
  );

  const root = el(
    "div",
    { class: "finale center", dataset: { screen: "finale" } },
    el(
      "div",
      { class: "finale__panel" },
      el("p", { class: "finale__eyebrow prompt", textContent: "Closing time" }),
      el("h1", { class: "finale__headline", textContent: "The bakery is full." }),
      el("p", {
        class: "finale__sub dim",
        textContent: "Crumb turns the lamps down and looks at what you made.",
      }),
      stack,
      el("p", { class: "finale__skip dim", textContent: "Tap to show it all" })
    )
  );

  // The reveal order, as one flat list, so skipping is just "run every remaining step now".
  const steps: (() => void)[] = [
    ...beatNodes.map((node, i) => () => {
      node.classList.add("is-in");
      audio.key(i % 4);
      // Keep the newest line in frame. Without this the last three beats of a seven-beat curtain
      // call arrive below the fold on a phone, and the child sits watching a screen that has
      // stopped changing while the best numbers land somewhere they cannot see.
      //
      // The `li` is `display: contents` so it has no box of its own and cannot be scrolled to —
      // the number inside it can.
      node.firstElementChild?.scrollIntoView({
        block: "center",
        behavior: world.reducedMotion ? "auto" : "smooth",
      });
      world.particles.burst(world.stage.width * (0.3 + 0.4 * ((i * 0.37) % 1)), world.stage.height * 0.72, {
        count: 10,
        color: "#FFD9A0",
        speed: 190,
      });
    }),
    () => {
      rooms.classList.add("is-in");
      rooms.scrollIntoView({ block: "center", behavior: world.reducedMotion ? "auto" : "smooth" });
      audio.hop();
    },
    () => {
      sign.classList.add("is-in");
      sign.scrollIntoView({ block: "center", behavior: world.reducedMotion ? "auto" : "smooth" });
      world.crumb.setMood("proud");
      audio.fanfare();
      world.particles.burst(world.stage.width / 2, world.stage.height * 0.34, {
        count: 90,
        color: world.scenery.current.accent,
        speed: 520,
      });
      world.particles.ring(world.stage.width / 2, world.stage.height * 0.34, "#FFFFFF", 300);
    },
    () => {
      done.classList.add("is-in");
      root.querySelector(".finale__skip")?.classList.add("is-gone");
      // On a phone the curtain call is taller than the screen, so the way out lands below the
      // fold — 144px under it on a 393x852 phone and 753px under it in landscape. A child looking
      // at a finished ending with no visible button is a child who is stuck, and the one thing
      // they will not think to do is scroll. The screen brings the button to them.
      root.scrollTo({ top: root.scrollHeight, behavior: world.reducedMotion ? "auto" : "smooth" });
      done.focus({ preventScroll: true });
    },
  ];

  let at = 0;
  let timer = 0;
  const runStep = (): void => {
    if (at >= steps.length) return;
    steps[at++]();
  };
  const schedule = (): void => {
    if (at >= steps.length) return;
    timer = window.setTimeout(() => {
      runStep();
      schedule();
    }, world.reducedMotion ? 320 : BEAT_MS);
  };
  const skip = (): void => {
    if (at >= steps.length) return;
    window.clearTimeout(timer);
    // Everything lands, but the last two steps still carry their fanfare, so a child who skips is
    // not punished with a silent ending.
    while (at < steps.length - 2) steps[at++]();
    runStep();
    runStep();
  };

  let removeTick: (() => void) | null = null;
  let prevRoom = "";

  return {
    element: root,
    mounted() {
      prevRoom = world.scenery.current.id;
      world.scenery.setRoom("night");
      world.scenery.setDecor(decor.map((d) => d.id));
      world.showCrumb = true;
      world.crumb.setMood("delighted");

      root.addEventListener("pointerdown", skip);
      schedule();

      removeTick = ticker.add(() => {
        world.crumb.setScale(0.78);
        world.crumb.moveTo(world.stage.width * 0.5, world.stage.height - 10);
      });
    },
    destroy() {
      window.clearTimeout(timer);
      root.removeEventListener("pointerdown", skip);
      removeTick?.();
      if (prevRoom && prevRoom !== "night") world.scenery.setRoom(prevRoom);
    },
  };
}

/** "1h 40m", or "40m" — never "100 minutes", which nobody pictures. */
function clockText(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
