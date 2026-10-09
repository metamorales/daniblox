import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_MS, FixedLoop, TICK_MS } from '../../src/app/loop';

function harness(startPhase = 0) {
  let clock = 0;
  const ticks: number[] = [];
  const renders: number[] = [];
  const loop = new FixedLoop({
    now: () => clock,
    startPhase,
    tick: (n) => ticks.push(n),
    render: (alpha) => renders.push(alpha),
  });
  return {
    loop,
    ticks,
    renders,
    /** Move the clock forward and run one frame, as the browser would. */
    frame(ms: number) {
      clock += ms;
      loop.advance(clock);
    },
    set(ms: number) {
      clock = ms;
    },
  };
}

describe('fixed-step loop', () => {
  it('runs 100 ticks in five simulated seconds', () => {
    const h = harness();
    h.loop.start();
    // Sixty frames a second for five seconds.
    for (let i = 0; i < 300; i++) h.frame(1000 / 60);
    expect(h.loop.ticks).toBeGreaterThanOrEqual(99);
    expect(h.loop.ticks).toBeLessThanOrEqual(101);
  });

  it('holds 20 Hz through an uneven frame rate', () => {
    const h = harness();
    h.loop.start();
    const pattern = [8, 33, 12, 50, 16, 9, 120, 16];
    let elapsed = 0;
    while (elapsed < 5000) {
      const step = pattern[Math.floor(elapsed / 100) % pattern.length] ?? 16;
      h.frame(step);
      elapsed += step;
    }
    // The loop clamps very long frames, so it may fall a little short; it must
    // never run ahead.
    expect(h.loop.ticks).toBeLessThanOrEqual(Math.round(elapsed / TICK_MS));
    expect(h.loop.ticks).toBeGreaterThan(90);
  });

  it('renders once per frame with alpha inside one tick', () => {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 20; i++) h.frame(7);
    expect(h.renders).toHaveLength(20);
    for (const alpha of h.renders) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('runs no catch-up ticks after ten hidden seconds', () => {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 60; i++) h.frame(1000 / 60);
    const before = h.loop.ticks;

    h.loop.stop();
    h.set(60_000); // the tab was hidden for a long time
    h.loop.resume();

    expect(h.loop.pendingMs).toBe(0);

    h.loop.advance(60_000);
    expect(h.loop.ticks, 'the loop replayed the hidden gap').toBe(before);
    expect(h.loop.pendingMs).toBe(0);
  });

  it('ignores advance while stopped', () => {
    const h = harness();
    h.loop.start();
    h.frame(1000);
    const before = h.loop.ticks;
    h.loop.stop();
    h.frame(1000);
    expect(h.loop.ticks).toBe(before);
  });

  it('never reports a negative frame time, even when the first frame predates the start', () => {
    // Animation-frame timestamps mark the frame's start, which can be earlier
    // than the clock read when the loop was armed.
    const frameTimes: number[] = [];
    const loop = new FixedLoop({
      now: () => 1000,
      tick: () => undefined,
      render: (_alpha, frameMs) => frameTimes.push(frameMs),
    });
    loop.start();
    loop.advance(990);
    loop.advance(1010);
    expect(frameTimes[0]).toBe(0);
    expect(frameTimes[1]).toBe(20);
    expect(loop.ticks).toBe(0);
  });

  it('never simulates more than a quarter second of a single long frame', () => {
    const h = harness();
    h.loop.start();
    h.frame(10_000);
    expect(h.loop.ticks).toBeLessThanOrEqual(Math.ceil(250 / TICK_MS));
  });
});

describe('day and night clock', () => {
  it('advances one tick at a time, never with raw wall time', () => {
    const h = harness();
    h.loop.start();
    expect(h.loop.dayPhase).toBe(0);
    for (let i = 0; i < 60; i++) h.frame(1000 / 60);

    // Roughly one second of a ten minute day, and exactly as many ticks as ran:
    // the clock is quantised to the simulation step, not to frame times.
    expect(h.loop.ticks).toBeGreaterThanOrEqual(19);
    expect(h.loop.ticks).toBeLessThanOrEqual(20);
    expect(h.loop.dayPhase).toBeCloseTo((h.loop.ticks * TICK_MS) / DAY_LENGTH_MS, 9);
  });

  it('wraps around after a full day', () => {
    const h = harness(0.95);
    h.loop.start();
    expect(h.loop.dayPhase).toBeCloseTo(0.95, 5);

    // Frames stay under the long-frame clamp so every millisecond counts.
    for (let i = 0; i < 200; i++) h.frame(200);

    const advanced = (h.loop.ticks * TICK_MS) / DAY_LENGTH_MS;
    expect(advanced).toBeGreaterThan(0.05);
    expect(h.loop.dayPhase).toBeCloseTo((0.95 + advanced) % 1, 6);
    // It really did roll over into the next day rather than saturating at 1.
    expect(h.loop.dayPhase).toBeLessThan(0.95);
  });

  it('does not advance while the tab is hidden', () => {
    const h = harness();
    h.loop.start();
    h.frame(1000);
    const phase = h.loop.dayPhase;
    h.loop.stop();
    h.set(500_000);
    h.loop.resume();
    expect(h.loop.dayPhase).toBeCloseTo(phase, 6);
  });
});
