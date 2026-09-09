import { audio } from "../core/audio";
import { el } from "../core/dom";
import { ticker } from "../core/ticker";
import { glow, withAlpha } from "../render/stage";
import type { ScreenInstance, World } from "../world";
import { store } from "../game/store";
import { makeOnboardingScreen } from "./onboarding";
import { makeMapScreen } from "./map";

/**
 * Title screen.
 *
 * Held to one rule: the child should want to touch the screen before they have read a word. Crumb
 * is already alive and already looking at them; the only control is a single primary button. There
 * is no settings gear, no login, no "rate us", no consent modal on first frame.
 */
export function makeTitleScreen(world: World): ScreenInstance {
  const returning = store.state.onboarded;

  const play = el("button", {
    class: "btn btn--primary btn--large title__play",
    type: "button",
    textContent: returning ? "Back to the bakery" : "Open the bakery",
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
      el("p", { class: "title__eyebrow", textContent: "A little bakery story" }),
      el("h1", { class: "title__word", aria: { label: "Crumb's Bakery" } }, ...spellCrumb()),
      el("p", {
        class: "title__tagline",
        textContent: "Every number you learn bakes a treat.",
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
      world.showCrumb = true;
      world.setRoom("kitchen");

      // Warm air rising off the ovens, carrying the odd stray sprinkle. The story's opening image —
      // a bakery that is already warm and working — shown rather than narrated.
      const puffs: { x: number; y: number; vx: number; vy: number; life: number; r: number }[] = [];
      let spawn = 0.4;

      removeLayer = world.stage.add((c) => {
        spawn -= c.dt;
        if (spawn <= 0 && !world.reducedMotion) {
          spawn = 1.1 + Math.random() * 2.2;
          puffs.push({
            x: c.width * (0.15 + Math.random() * 0.7),
            y: c.height * 0.92,
            vx: (Math.random() - 0.5) * 26,
            vy: -34 - Math.random() * 26,
            life: 0,
            r: 16 + Math.random() * 22,
          });
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life += c.dt;
          p.x += p.vx * c.dt;
          p.y += p.vy * c.dt;
          p.vx += Math.sin(p.life * 1.4) * 6 * c.dt;
          if (p.life > 5.5) {
            puffs.splice(i, 1);
            continue;
          }
          // Rise, swell, and fade — the shape of steam.
          const t = p.life / 5.5;
          const alpha = Math.sin(t * Math.PI) * 0.22;
          const r = p.r * (1 + t * 1.9);
          glow(c.ctx, p.x, p.y, r, "#FFE7C4", alpha);
          c.ctx.fillStyle = withAlpha("#FFF3DE", alpha * 0.35);
          c.ctx.beginPath();
          c.ctx.arc(p.x, p.y, r * 0.36, 0, Math.PI * 2);
          c.ctx.fill();
        }
      }, 10);

      removeTick = ticker.add((_, elapsed) => {
        const w = world.stage.width;
        const h = world.stage.height;
        world.crumb.setScale(Math.min(1.35, w / 620 + 0.5));
        world.crumb.moveTo(w * 0.5, h * 0.62 + Math.sin(elapsed * 0.5) * 6);
      });

      // A single greeting hop shortly after arrival — a small sign of life, not a performance.
      setTimeout(() => {
        world.crumb.setMood("curious");
        world.crumb.hop(20);
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
 * assembles itself sets the tone for a game where things are made piece by piece.
 */
function spellCrumb(): HTMLElement[] {
  return [..."CRUMB"].map((ch, i) =>
    el("span", {
      class: "title__letter",
      textContent: ch,
      style: { animationDelay: `${140 + i * 62}ms` },
      aria: { hidden: "true" },
    })
  );
}
