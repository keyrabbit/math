type TickFn = (dt: number, elapsed: number) => void;

/**
 * Single shared rAF loop. Everything animated subscribes here rather than starting its own
 * requestAnimationFrame, so the whole game advances on one consistent clock and can be paused,
 * slowed for debugging, or stopped when the tab is hidden.
 */
class Ticker {
  private subscribers = new Set<TickFn>();
  private last = 0;
  private running = false;
  private raf = 0;
  elapsed = 0;
  /** Debug aid: set to 0.2 to inspect animations in slow motion. */
  timeScale = 1;

  add(fn: TickFn): () => void {
    this.subscribers.add(fn);
    this.start();
    return () => this.subscribers.delete(fn);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    // Clamp dt so a backgrounded tab doesn't explode physics on return.
    const rawDt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    const dt = rawDt * this.timeScale;
    this.elapsed += dt;
    for (const fn of this.subscribers) fn(dt, this.elapsed);
    this.raf = requestAnimationFrame(this.frame);
  };
}

export const ticker = new Ticker();

document.addEventListener("visibilitychange", () => {
  // Avoid a huge catch-up frame when the player comes back to the tab.
  if (!document.hidden) ticker.timeScale = ticker.timeScale;
});
