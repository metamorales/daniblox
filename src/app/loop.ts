/**
 * The fixed-step simulation loop (spec R4).
 *
 * Simulation runs at a fixed 20 Hz and rendering interpolates between ticks,
 * so behaviour does not change with frame rate. The loop owns the world clock;
 * the renderer only reads it.
 *
 * Hiding the tab pauses everything. On return the accumulator is reset rather
 * than replayed, because a tab left in the background for an hour should come
 * back to a world that waited, not one that fast-forwards through 72,000 ticks
 * in a single frame.
 */

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
/** A full day takes ten minutes. */
export const DAY_LENGTH_MS = 10 * 60 * 1000;
/** Never simulate more than this much wall time in one frame. */
const MAX_FRAME_MS = 250;

export interface LoopHooks {
  /** One simulation step. */
  tick(tickIndex: number): void;
  /** Draw a frame. `alpha` is the fraction between the last tick and the next. */
  render(alpha: number, frameMs: number): void;
}

export interface LoopOptions extends LoopHooks {
  /** Injectable for tests; defaults to performance.now. */
  now?: () => number;
  /** Start the clock part-way through the day. 0 is dawn. */
  startPhase?: number;
}

export class FixedLoop {
  private readonly now: () => number;
  private readonly hooks: LoopHooks;

  private running = false;
  private rafHandle = 0;
  private lastTime = 0;
  private accumulator = 0;

  private tickCount = 0;
  private elapsedMs: number;
  /** True once animation frames are driving the loop, so a resume re-arms them. */
  private driven = false;

  constructor(options: LoopOptions) {
    this.now = options.now ?? (() => performance.now());
    this.hooks = { tick: options.tick, render: options.render };
    this.elapsedMs = (options.startPhase ?? 0) * DAY_LENGTH_MS;
  }

  /** Simulation steps run so far. */
  get ticks(): number {
    return this.tickCount;
  }

  /** Unconsumed wall time, in milliseconds. Zero right after a resume. */
  get pendingMs(): number {
    return this.accumulator;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Position in the day, 0 at dawn through to 1. */
  get dayPhase(): number {
    return (this.elapsedMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
  }

  set dayPhase(phase: number) {
    this.elapsedMs = (((phase % 1) + 1) % 1) * DAY_LENGTH_MS;
  }

  /**
   * Arm the loop. It does not drive itself: call `run` to hand it the browser's
   * animation frames, or call `advance` yourself, which is what the tests do.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.accumulator = 0;
  }

  /** Arm the loop and drive it from the browser's animation frames. */
  run(): void {
    this.start();
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  /**
   * Resume after a pause without replaying the gap. The accumulator and the
   * clock both pick up from now.
   */
  resume(): void {
    if (this.running) return;
    const driven = this.driven;
    this.start();
    if (driven) this.scheduleFrame();
  }

  /**
   * Advance by one frame. Called by the animation frame in the browser and
   * directly by tests, which is why it takes the time rather than reading it.
   */
  advance(currentTime: number): void {
    if (!this.running) return;

    const frameMs = Math.min(currentTime - this.lastTime, MAX_FRAME_MS);
    this.lastTime = currentTime;
    this.accumulator += Math.max(frameMs, 0);

    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.elapsedMs += TICK_MS;
      this.tickCount++;
      this.hooks.tick(this.tickCount);
    }

    this.hooks.render(this.accumulator / TICK_MS, frameMs);
  }

  private scheduleFrame(): void {
    this.driven = true;
    this.rafHandle = requestAnimationFrame((time) => {
      if (!this.running) return;
      this.advance(time);
      this.scheduleFrame();
    });
  }

  /** Pause when the tab is hidden and resume when it comes back. */
  bindVisibility(target: Document = document): () => void {
    const onChange = (): void => {
      if (target.hidden) this.stop();
      else this.resume();
    };
    target.addEventListener('visibilitychange', onChange);
    return () => {
      target.removeEventListener('visibilitychange', onChange);
    };
  }
}
