import { audio } from "./core/audio";
import { clear, wait } from "./core/dom";
import { ticker } from "./core/ticker";
import { ConstellationView } from "./render/constellation";
import { Particles } from "./render/particles";
import { Pipkin, paletteForBiome } from "./render/pipkin";
import { BIOMES, Scenery } from "./render/scenery";
import { Stage } from "./render/stage";
import { store } from "./game/store";

export interface ScreenInstance {
  element: HTMLElement;
  /** Called after the element is attached and the enter animation has started. */
  mounted?: () => void;
  /** Called before removal; must tear down listeners and canvas layers. */
  destroy?: () => void;
}

export type ScreenFactory = (world: World) => ScreenInstance;

/**
 * The World owns everything persistent across screens: the canvas stage, the scenery, the Pipkin,
 * the particle system and the constellation renderer.
 *
 * Screens come and go; the Pipkin does not. Keeping the character alive across navigation (rather
 * than re-mounting it per screen) is what makes it feel like a companion travelling with the child
 * instead of a decoration on each page.
 */
export class World {
  readonly stage: Stage;
  readonly scenery: Scenery;
  readonly pipkin: Pipkin;
  readonly particles: Particles;
  readonly constellation = new ConstellationView();
  readonly uiRoot: HTMLElement;

  private current: ScreenInstance | null = null;
  private navigating = false;
  private pointerX = 0;
  private pointerY = 0;
  /** Where collected pips fly to — updated by whichever HUD is on screen. */
  pipTarget = { x: 60, y: 40 };
  /** Screens set this to false to hide the world-level Pipkin (e.g. the Atlas). */
  showPipkin = true;
  reducedMotion = false;

  constructor(stageCanvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.stage = new Stage(stageCanvas);
    this.scenery = new Scenery("meadow");
    this.particles = new Particles();
    this.pipkin = new Pipkin(0, 0, 1);
    this.uiRoot = uiRoot;

    this.reducedMotion =
      store.state.settings.reducedMotion ??
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.buildLayers();
    this.stage.start();
    this.bindPointer();
  }

  private buildLayers(): void {
    // z=0 backdrop
    this.stage.add((c) => {
      this.scenery.update(c.dt);
      this.scenery.drawBackground(c);
      if (!this.reducedMotion) {
        this.particles.ambient(c.dt, c.width, c.height, this.scenery.current.accent);
      }
    }, 0);

    // z=20 the Pipkin, above scenery and below the DOM UI
    this.stage.add((c) => {
      if (!this.showPipkin) return;
      this.pipkin.update(c.dt);
      this.pipkin.draw(c.ctx);
    }, 20);

    // z=40 particles over everything in the world
    this.stage.add((c) => {
      this.particles.update(c.dt);
      this.particles.draw(c);
    }, 40);

    // z=100 colour grade — always last
    this.stage.add((c) => this.scenery.drawGrade(c), 100);
  }

  private bindPointer(): void {
    const move = (x: number, y: number): void => {
      this.pointerX = x;
      this.pointerY = y;
      const nx = (x / this.stage.width) * 2 - 1;
      const ny = (y / this.stage.height) * 2 - 1;
      if (!this.reducedMotion) this.scenery.setParallax(nx, ny);
      if (this.showPipkin) this.pipkin.lookAt(x, y);
    };
    window.addEventListener(
      "pointermove",
      (e) => move(e.clientX, e.clientY),
      { passive: true }
    );
    window.addEventListener(
      "pointerdown",
      (e) => {
        audio.unlock();
        move(e.clientX, e.clientY);
      },
      { passive: true }
    );
    window.addEventListener("keydown", () => audio.unlock(), { once: true });
    // On devices with no pointer, sweep the gaze slowly so the character still feels alive.
    ticker.add((_, elapsed) => {
      if (this.pointerX === 0 && this.pointerY === 0 && this.showPipkin) {
        this.pipkin.lookAt(
          this.stage.width / 2 + Math.sin(elapsed * 0.4) * this.stage.width * 0.18,
          this.stage.height / 2 + Math.cos(elapsed * 0.3) * 60
        );
      }
    });
  }

  setBiome(biomeId: string): void {
    this.scenery.setBiome(biomeId);
    const b = BIOMES[biomeId];
    if (b) {
      this.pipkin.palette = paletteForBiome(b.accent, b.deep);
      audio.startAmbience(b.droneRoot);
    }
  }

  /** Celebration helper used by every mode, so reward always feels identical. */
  reward(x: number, y: number, streak: number): void {
    audio.correct(streak);
    this.pipkin.celebrate();
    this.particles.ring(x, y, "#FFFFFF", 110);
    if (!this.reducedMotion) {
      this.particles.collect(x, y, this.pipTarget, 8, this.scenery.current.accent);
    }
  }

  /** The gentle "not yet" response. Never punitive. */
  softMiss(): void {
    audio.softMiss();
    this.pipkin.encourage();
  }

  // ------------------------------------------------------------ navigation

  async go(factory: ScreenFactory): Promise<void> {
    if (this.navigating) return;
    this.navigating = true;
    const outgoing = this.current;
    if (outgoing) {
      outgoing.element.dataset.state = "exiting";
      await wait(this.reducedMotion ? 60 : 200);
      outgoing.destroy?.();
      outgoing.element.remove();
    }
    const screen = factory(this);
    screen.element.classList.add("screen");
    screen.element.dataset.state = "entering";
    this.uiRoot.appendChild(screen.element);
    this.current = screen;
    screen.mounted?.();
    this.navigating = false;
  }

  destroy(): void {
    this.current?.destroy?.();
    clear(this.uiRoot);
    this.stage.destroy();
  }
}
