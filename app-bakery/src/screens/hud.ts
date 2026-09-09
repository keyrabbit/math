import { el } from "../core/dom";
import { audio } from "../core/audio";
import type { World } from "../world";

export interface HudOptions {
  onBack?: () => void;
  showSprinkles?: boolean;
  segments?: number;
  title?: string;
}

/**
 * The top bar shared by every gameplay screen.
 *
 * Mirrors the one genuinely good chrome idea in the reference app — a segmented progress bar that
 * shows exactly how much of the current activity remains — but fixes its two problems: segments
 * fill progressively rather than snapping, and there is no countdown timer, because a visible clock
 * turns practice into a stress test for exactly the children who need practice most.
 */
export class Hud {
  readonly element: HTMLElement;
  private valueEl: HTMLElement;
  private segmentsEl: HTMLElement;
  private jarDot: HTMLElement;
  private world: World;
  private displayed = 0;

  constructor(world: World, opts: HudOptions = {}) {
    this.world = world;
    const segments = opts.segments ?? 0;

    this.jarDot = el("span", { class: "dot" });
    this.valueEl = el("span", { class: "hud__value", textContent: "0" });

    this.segmentsEl = el("div", {
      class: "segments",
      aria: { role: "progressbar", valuemin: 0, valuemax: segments, valuenow: 0, label: "Baking progress" },
    });
    for (let i = 0; i < segments; i++) {
      this.segmentsEl.appendChild(el("div", { class: "segment", dataset: { i } }));
    }

    const back =
      opts.onBack &&
      el(
        "button",
        {
          class: "btn btn--ghost btn--icon",
          aria: { label: "Back" },
          on: {
            click: () => {
              audio.back();
              opts.onBack?.();
            },
          },
        },
        backIcon()
      );

    this.element = el(
      "header",
      { class: "hud" },
      back,
      segments > 0 ? this.segmentsEl : el("div", { class: "hud__spacer" }),
      opts.showSprinkles === false
        ? null
        : el(
            "div",
            { class: "hud__chip", aria: { label: "Sprinkles collected", live: "polite" } },
            this.jarDot,
            this.valueEl
          )
    );
  }

  /** Call once mounted so collected sprinkles fly to the right place. */
  registerSprinkleTarget(): void {
    requestAnimationFrame(() => {
      const r = this.jarDot.getBoundingClientRect();
      this.world.sprinkleTarget = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }

  setSprinkles(value: number, animate = true): void {
    if (value === this.displayed) return;
    this.displayed = value;
    this.valueEl.textContent = String(value);
    if (!animate) return;
    // Bump the counter so the number *lands* rather than silently swapping.
    this.valueEl.dataset.bump = "1";
    setTimeout(() => delete this.valueEl.dataset.bump, 240);
  }

  /** `progress` is a float: 2.5 means two segments done and the third half full. */
  setProgress(progress: number): void {
    const children = [...this.segmentsEl.children] as HTMLElement[];
    children.forEach((seg, i) => {
      const fill = Math.max(0, Math.min(1, progress - i));
      seg.style.setProperty("--fill", String(fill));
      seg.dataset.state = fill >= 1 ? "done" : "active";
    });
    this.segmentsEl.setAttribute("aria-valuenow", String(Math.floor(progress)));
  }
}

function backIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M15 5l-7 7 7 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}
