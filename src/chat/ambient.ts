/**
 * Idle remarks (spec: ambient chatter, at most one exchange every thirty
 * seconds, nothing while busy).
 *
 * With one kit there is nobody for her to chat with, so the ambient line is
 * a remark to herself that the player overhears. This decides when; what she
 * says comes from the dialogue templates, or from the model when the player
 * has turned that on. It runs on the simulation clock, so it pauses with the
 * world when the tab is hidden.
 */

export const AMBIENT_MIN_GAP_MS = 30_000;
/** She settles for a moment before musing, so a finished job is not talked over. */
export const AMBIENT_SETTLE_MS = 5_000;

export class AmbientChatter {
  private idleSince: number | null = null;
  /** Counted from the start of the session, so the first remark waits a full gap. */
  private lastSpoke = 0;
  private nextGap: number;

  constructor(private readonly random: () => number = Math.random) {
    this.nextGap = this.pickGap();
  }

  /** Between thirty seconds and a minute, so it never feels like a timer. */
  private pickGap(): number {
    return AMBIENT_MIN_GAP_MS + this.random() * AMBIENT_MIN_GAP_MS;
  }

  /**
   * Once per tick. `now` is simulation time in milliseconds. Returns true on
   * the tick she should say something.
   */
  tick(idle: boolean, now: number): boolean {
    if (!idle) {
      this.idleSince = null;
      return false;
    }
    this.idleSince ??= now;
    if (now - this.idleSince < AMBIENT_SETTLE_MS) return false;
    if (now - this.lastSpoke < this.nextGap) return false;
    this.lastSpoke = now;
    this.nextGap = this.pickGap();
    return true;
  }

  /** Anyone speaking, her included, pushes the next remark out. */
  noteSpeech(now: number): void {
    this.lastSpoke = now;
  }
}
