import { describe, expect, it } from 'vitest';
import { AMBIENT_MIN_GAP_MS, AmbientChatter } from '../../src/chat/ambient';

const TICK = 50;

function run(chatter: AmbientChatter, minutes: number, idle: (ms: number) => boolean): number[] {
  const spoke: number[] = [];
  for (let ms = 0; ms < minutes * 60_000; ms += TICK) {
    if (chatter.tick(idle(ms), ms)) spoke.push(ms);
  }
  return spoke;
}

describe('idle remarks', () => {
  it('come no more than once every thirty seconds, and keep coming while idle', () => {
    const spoke = run(new AmbientChatter(() => 0.5), 10, () => true);
    expect(spoke.length).toBeLessThanOrEqual(20);
    expect(spoke.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < spoke.length; i++) {
      expect((spoke[i] ?? 0) - (spoke[i - 1] ?? 0)).toBeGreaterThanOrEqual(AMBIENT_MIN_GAP_MS);
    }
  });

  it('never speak while she is busy', () => {
    expect(run(new AmbientChatter(), 10, () => false)).toEqual([]);
  });

  it('wait for her to settle after a job, and after anyone speaks', () => {
    const chatter = new AmbientChatter(() => 0);
    // Busy for a minute, then idle: nothing in the first five seconds of idleness.
    const spoke = run(chatter, 2, (ms) => ms >= 60_000);
    expect(spoke[0]).toBeGreaterThanOrEqual(65_000);

    chatter.noteSpeech(120_000);
    let next: number | null = null;
    for (let ms = 120_000; ms < 200_000; ms += TICK) {
      if (chatter.tick(true, ms)) {
        next = ms;
        break;
      }
    }
    expect(next).not.toBeNull();
    expect((next ?? 0) - 120_000).toBeGreaterThanOrEqual(AMBIENT_MIN_GAP_MS);
  });
});
