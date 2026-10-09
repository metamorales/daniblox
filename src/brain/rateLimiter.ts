/**
 * A sliding-window request cap (spec R3).
 *
 * Ten a minute is a spend guard, not a throttle: typing by hand rarely gets
 * near it, but a loop that calls out in a frame loop would run up a bill in
 * seconds. When it trips, Luciana says she needs a breather and the scripted
 * brain answers instead.
 */

export const DEFAULT_LIMIT = 10;
export const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly limit: number = DEFAULT_LIMIT,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Requests made in the last minute. */
  get used(): number {
    this.forget();
    return this.stamps.length;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  /** Seconds until the next slot frees up, or 0 when one is free now. */
  get waitSeconds(): number {
    if (this.remaining > 0) return 0;
    const oldest = this.stamps[0];
    if (oldest === undefined) return 0;
    return Math.max(0, Math.ceil((oldest + WINDOW_MS - this.now()) / 1000));
  }

  /** Take a slot. Returns false when the cap is reached. */
  take(): boolean {
    this.forget();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(this.now());
    return true;
  }

  reset(): void {
    this.stamps.length = 0;
  }

  private forget(): void {
    const cutoff = this.now() - WINDOW_MS;
    while (this.stamps.length > 0 && (this.stamps[0] ?? 0) <= cutoff) this.stamps.shift();
  }
}
