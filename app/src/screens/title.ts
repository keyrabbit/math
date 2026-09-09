import { audio } from "../core/audio";
import { el } from "../core/dom";
import { ticker } from "../core/ticker";
import { glow, sparkle, withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { store } from "../game/store";
import { makeOnboardingScreen } from "./onboarding";
import { makeMapScreen } from "./map";

/**
 * Title screen.
 *
 * Held to one rule: the child should want to touch the screen before they have read a word. The
 * Pipkin is already alive and already looking at them; the only control is a single primary button.
 * There is no settings gear, no login, no "rate us", no consent modal on first frame.
 */
export function makeTitleScreen(world: World): ScreenInstance {
  const returning = store.state.onboarded;

  const play = el("button", {
    class: "btn btn--primary btn--large title__play",
    type: "button",
    textContent: returning ? "Continue" : "Begin",
    on: {
      click: () => {
        audio.unlock();
        audio.select();
        void world.go(returning ? makeMapScreen : makeOnboardingScreen);
      },
    },
  });

  const root = el(
    "div",
    { class: "title center" },
    el(
      "div",
      { class: "title__inner" },
      el("p", { class: "title__eyebrow", textContent: "A counting-star journey" }),
      el("h1", { class: "title__word", aria: { label: "Pipkin" } }, ...spellPipkin()),
      el("p", {
        class: "title__tagline",
        textContent: "Every number you master lights a star.",
      })
    ),
    el("div", { class: "grow" }),
    play
  );

  let removeLayer: (() => void) | null = null;
  let removeTick: (() => void) | null = null;

  return {
    element: root,
    mounted() {
      world.showPipkin = true;
      world.setBiome("meadow");

      // A slow shower of falling counting-stars behind the title — the story's inciting image,
      // shown rather than narrated.
      const shooting: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
      let spawn = 0.6;

      removeLayer = world.stage.add((c) => {
        spawn -= c.dt;
        if (spawn <= 0 && !world.reducedMotion) {
          spawn = 1.6 + Math.random() * 3.2;
          shooting.push({
            x: Math.random() * c.width,
            y: -20,
            vx: -60 - Math.random() * 90,
            vy: 190 + Math.random() * 160,
            life: 0,
          });
        }
        for (let i = shooting.length - 1; i >= 0; i--) {
          const s = shooting[i];
          s.life += c.dt;
          s.x += s.vx * c.dt;
          s.y += s.vy * c.dt;
          if (s.y > c.height * 0.72 || s.life > 5) {
            shooting.splice(i, 1);
            continue;
          }
          const alpha = Math.min(1, s.life * 2) * Math.max(0, 1 - s.life / 3);
          const tailX = s.x - s.vx * 0.16;
          const tailY = s.y - s.vy * 0.16;
          const g = c.ctx.createLinearGradient(s.x, s.y, tailX, tailY);
          g.addColorStop(0, withAlpha("#FFFFFF", alpha * 0.8));
          g.addColorStop(1, withAlpha("#FFD782", 0));
          c.ctx.strokeStyle = g;
          c.ctx.lineWidth = 2;
          c.ctx.lineCap = "round";
          c.ctx.beginPath();
          c.ctx.moveTo(s.x, s.y);
          c.ctx.lineTo(tailX, tailY);
          c.ctx.stroke();
          glow(c.ctx, s.x, s.y, 26, "#FFD782", alpha * 0.7);
          sparkle(c.ctx, s.x, s.y, 4, "#FFFFFF", alpha);
        }
      }, 10);

      removeTick = ticker.add((_, elapsed) => {
        const w = world.stage.width;
        const h = world.stage.height;
        world.pipkin.setScale(Math.min(1.35, w / 620 + 0.5));
        world.pipkin.moveTo(w * 0.5, h * 0.62 + Math.sin(elapsed * 0.5) * 6);
      });

      // A single greeting hop shortly after arrival — a small sign of life, not a performance.
      setTimeout(() => {
        world.pipkin.setMood("curious");
        world.pipkin.hop(20);
      }, 900);
    },
    destroy() {
      removeLayer?.();
      removeTick?.();
    },
  };
}

/**
 * The wordmark, one letter per element so each can be animated independently. A logotype that
 * assembles itself sets the tone for a game where things are built piece by piece.
 */
function spellPipkin(): HTMLElement[] {
  return [..."PIPKIN"].map((ch, i) =>
    el("span", {
      class: "title__letter",
      textContent: ch,
      style: { animationDelay: `${140 + i * 62}ms` },
      aria: { hidden: "true" },
    })
  );
}
