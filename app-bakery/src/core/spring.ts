/**
 * Critically-damped-ish spring integrator.
 *
 * Springs (rather than fixed-duration easing) are used for anything the player touches or that
 * should feel alive, because they carry velocity across interruptions instead of restarting from
 * zero. Parameterised the way Apple exposes it (duration + bounce) because that is far easier to
 * reason about than raw stiffness/damping.
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private stiffness: number;
  private damping: number;

  constructor(initial: number, opts: { duration?: number; bounce?: number } = {}) {
    this.value = initial;
    this.target = initial;
    const duration = opts.duration ?? 0.4;
    const bounce = opts.bounce ?? 0.15;
    // Map Apple's (duration, bounce) onto classic stiffness/damping for a unit mass.
    const omega = (2 * Math.PI) / duration;
    this.stiffness = omega * omega;
    const zeta = 1 - bounce;
    this.damping = 2 * zeta * omega;
  }

  set(target: number): this {
    this.target = target;
    return this;
  }

  /** Jump instantly, killing velocity. Used when re-seeding state between screens. */
  reset(value: number): this {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this;
  }

  /** Nudge the spring's velocity directly — useful for impulses (a hop, a knock). */
  impulse(v: number): this {
    this.velocity += v;
    return this;
  }

  step(dt: number): number {
    // Sub-step for stability when a frame is long (tab restore, slow device).
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  get settled(): boolean {
    return Math.abs(this.value - this.target) < 0.001 && Math.abs(this.velocity) < 0.001;
  }
}

/** Frame-rate independent exponential smoothing. `rate` is roughly "fraction closed per second". */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Smooth 0..1 ramp, used for hand-rolled tweens on canvas. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Strong ease-out — the built-in CSS curves are too weak to feel intentional. */
export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
