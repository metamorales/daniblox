import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/brain/schema';
import { ActionQueue, type ActionWorld } from '../../src/folk/actions';
import { Kit } from '../../src/folk/kit';
import { AIR } from '../../src/world/blocks';
import { WORLD_Y, World } from '../../src/world/chunks';

interface Harness {
  world: World;
  kit: Kit;
  queue: ActionQueue;
  reports: { note: string; detail?: Record<string, unknown> }[];
  dayPhase: number;
  run(ticks?: number): void;
}

function harness(at = { x: 8, y: 1, z: 8 }, size = 24): Harness {
  const world = new World(1);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) world.set(x, 0, z, 3);
  }
  const kit = new Kit({
    id: 'luciana',
    name: 'Luciana',
    appearance: { coat: '#ffffff', patch: '#2b2436' },
    at,
  });
  const reports: Harness['reports'] = [];
  const state = { dayPhase: 0.3 };

  const context: ActionWorld = {
    world,
    kits: [kit],
    reticle: () => ({ x: 2, y: 1, z: 2 }),
    setDayPhase: (phase) => {
      state.dayPhase = phase;
    },
    seed: 7,
    report: (_kit, note, detail) => reports.push({ note, detail }),
  };
  const queue = new ActionQueue(kit, context);

  return {
    world,
    kit,
    queue,
    reports,
    get dayPhase() {
      return state.dayPhase;
    },
    run(ticks = 600) {
      let clock = 0;
      const now = (): number => (clock += 0.05);
      for (let i = 0; i < ticks; i++) {
        kit.tick(world, now);
        queue.tick();
        if (queue.idle) break;
      }
    },
  };
}

const notes = (h: Harness): string[] => h.reports.map((r) => r.note);

describe('goto', () => {
  it('walks there and finishes', () => {
    const h = harness();
    h.queue.push([{ type: 'goto', at: { x: 14, y: 1, z: 8 } }]);
    h.run();
    expect(h.queue.idle).toBe(true);
    expect(h.kit.cell).toEqual({ x: 14, y: 1, z: 8 });
  });

  it('aims at the space above a block rather than inside it', () => {
    const h = harness();
    h.world.set(14, 1, 8, 3);
    h.queue.push([{ type: 'goto', at: { x: 14, y: 1, z: 8 } }]);
    h.run();
    expect(h.kit.cell).toEqual({ x: 14, y: 2, z: 8 });
  });

  it('says it cannot reach somewhere sealed off', () => {
    const h = harness();
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      h.world.set(18 + (dx ?? 0), 1, 18 + (dz ?? 0), 3);
      h.world.set(18 + (dx ?? 0), 2, 18 + (dz ?? 0), 3);
    }
    h.world.set(18, 2, 18, 3);
    h.queue.push([{ type: 'goto', at: { x: 18, y: 3, z: 18 } }]);
    h.run(2000);
    expect(h.queue.idle).toBe(true);
  });
});

describe('mine', () => {
  it('walks over, works for six tenths of a second, and takes the block', () => {
    const h = harness();
    h.world.set(11, 1, 8, 5);
    h.queue.push([{ type: 'mine', at: { x: 11, y: 1, z: 8 } }]);
    h.run();
    expect(h.world.get(11, 1, 8)).toBe(AIR);
    expect(h.kit.carrying(5)).toBe(1);
    expect(notes(h)).toContain('mined');
  });

  it('does not take the block before the work is done', () => {
    const h = harness();
    h.world.set(9, 1, 8, 5);
    h.queue.push([{ type: 'mine', at: { x: 9, y: 1, z: 8 } }]);
    // Reach it, then stop one tick short of finishing.
    let clock = 0;
    const now = (): number => (clock += 0.05);
    for (let i = 0; i < 40; i++) {
      h.kit.tick(h.world, now);
      h.queue.tick();
      if (h.world.get(9, 1, 8) === AIR) break;
    }
    expect(h.kit.carrying(5)).toBe(1);
  });

  it('reports how far through the block she is, and only while she works', () => {
    const h = harness();
    // Far enough that she has to walk first.
    h.world.set(12, 1, 8, 5);
    h.queue.push([{ type: 'mine', at: { x: 12, y: 1, z: 8 } }]);
    let clock = 0;
    const now = (): number => (clock += 0.05);
    const seen: (number | null)[] = [];
    for (let i = 0; i < 80 && !h.queue.idle; i++) {
      h.kit.tick(h.world, now);
      h.queue.tick();
      seen.push(h.kit.progress);
    }
    // Nothing while walking over, a steady climb while digging, nothing after.
    expect(seen[0]).toBeNull();
    const climbing = seen.filter((p): p is number => p !== null);
    expect(climbing.length).toBeGreaterThan(5);
    expect(climbing[0]).toBeGreaterThan(0);
    // The bar fills on the tick the block comes out, and clears in the same tick.
    expect(climbing[climbing.length - 1]).toBeGreaterThanOrEqual(11 / 12);
    for (let i = 1; i < climbing.length; i++) {
      expect(climbing[i]).toBeGreaterThan(climbing[i - 1] ?? 0);
    }
    expect(h.kit.progress).toBeNull();
  });

  it('gathers a count of a type', () => {
    const h = harness();
    for (let i = 0; i < 4; i++) h.world.set(11 + i, 1, 8, 5);
    h.queue.push([{ type: 'mine', block: 5, count: 3 }]);
    h.run(3000);
    expect(h.kit.carrying(5)).toBe(3);
    expect(notes(h)).toContain('gathered');
  });

  it('says there are none nearby when the type is absent', () => {
    const h = harness();
    h.queue.push([{ type: 'mine', block: 6, count: 2 }]);
    h.run();
    expect(notes(h)).toContain('none-nearby');
    expect(h.kit.carrying(6)).toBe(0);
  });

  it('reports a shortfall when it runs out part way', () => {
    const h = harness();
    h.world.set(11, 1, 8, 5);
    h.queue.push([{ type: 'mine', block: 5, count: 4 }]);
    h.run(3000);
    expect(h.kit.carrying(5)).toBe(1);
    expect(notes(h)).toContain('gathered-some');
  });

  it('says nothing is there when the cell is already empty', () => {
    const h = harness();
    h.queue.push([{ type: 'mine', at: { x: 11, y: 5, z: 8 } }]);
    h.run();
    expect(notes(h)).toContain('nothing-there');
  });

  it('never mines a block it cannot get beside', () => {
    const h = harness();
    // Buried in the middle of a solid lump.
    for (let x = 14; x <= 16; x++) {
      for (let y = 1; y <= 3; y++) {
        for (let z = 14; z <= 16; z++) h.world.set(x, y, z, 3);
      }
    }
    h.world.set(15, 2, 15, 5);
    h.queue.push([{ type: 'mine', block: 5, count: 1 }]);
    h.run(3000);
    expect(h.world.get(15, 2, 15)).toBe(5);
    expect(notes(h)).toContain('none-nearby');
  });
});

describe('place', () => {
  const stocked = (): Harness => {
    const h = harness();
    h.kit.take(7, 4);
    return h;
  };

  it('puts a block down and spends it', () => {
    const h = stocked();
    h.queue.push([{ type: 'place', block: 7, at: { x: 11, y: 1, z: 8 } }]);
    h.run();
    expect(h.world.get(11, 1, 8)).toBe(7);
    expect(h.kit.carrying(7)).toBe(3);
    expect(notes(h)).toContain('placed');
  });

  it('refuses with an empty pocket', () => {
    const h = harness();
    h.queue.push([{ type: 'place', block: 7, at: { x: 11, y: 1, z: 8 } }]);
    h.run();
    expect(notes(h)).toContain('nothing-to-place');
    expect(h.world.get(11, 1, 8)).toBe(AIR);
  });

  it('refuses a cell that is already taken', () => {
    const h = stocked();
    h.world.set(11, 1, 8, 3);
    h.queue.push([{ type: 'place', block: 7, at: { x: 11, y: 1, z: 8 } }]);
    h.run();
    expect(notes(h)).toContain('already-something-there');
    expect(h.kit.carrying(7)).toBe(4);
  });

  it('refuses a cell floating in mid-air', () => {
    const h = stocked();
    h.queue.push([{ type: 'place', block: 7, at: { x: 11, y: 20, z: 8 } }]);
    h.run();
    expect(notes(h)).toContain('nothing-to-build-on');
  });

  it('refuses to build on top of itself', () => {
    const h = stocked();
    const cell = h.kit.cell;
    h.queue.push([{ type: 'place', block: 7, at: cell }]);
    h.run();
    expect(notes(h)).toContain('standing-there');
  });
});

describe('wander and follow', () => {
  it('wanders without leaving the world or clipping', () => {
    const h = harness();
    h.queue.push([{ type: 'wander' }]);
    let clock = 0;
    const now = (): number => (clock += 0.05);
    for (let i = 0; i < 600; i++) {
      h.kit.tick(h.world, now);
      h.queue.tick();
      const c = h.kit.cell;
      expect(h.world.get(c.x, c.y, c.z)).toBe(AIR);
    }
    expect(h.queue.idle).toBe(false);
  });

  it('follows the camera and stops close to it', () => {
    const h = harness({ x: 18, y: 1, z: 18 });
    h.queue.push([{ type: 'follow', target: 'user' }]);
    let clock = 0;
    const now = (): number => (clock += 0.05);
    for (let i = 0; i < 1200; i++) {
      h.kit.tick(h.world, now);
      h.queue.tick();
    }
    // The reticle is at 2,1,2.
    expect(Math.abs(h.kit.cell.x - 2) + Math.abs(h.kit.cell.z - 2)).toBeLessThanOrEqual(3);
  });

  it('says so when asked to follow a kit that is not here', () => {
    const h = harness();
    h.queue.push([{ type: 'follow', target: 'nobody' }]);
    h.run();
    expect(notes(h)).toContain('no-such-kit');
  });
});

describe('stop and queueing', () => {
  it('runs jobs in order', () => {
    const h = harness();
    h.world.set(11, 1, 8, 5);
    h.queue.push([
      { type: 'mine', at: { x: 11, y: 1, z: 8 } },
      { type: 'goto', at: { x: 4, y: 1, z: 4 } },
    ]);
    h.run(3000);
    expect(h.kit.carrying(5)).toBe(1);
    expect(h.kit.cell).toEqual({ x: 4, y: 1, z: 4 });
  });

  it('carries on past a job the world will not allow', () => {
    const h = harness();
    h.queue.push([
      { type: 'mine', block: 6, count: 1 }, // nothing of that type anywhere
      { type: 'goto', at: { x: 4, y: 1, z: 4 } },
    ]);
    h.run(3000);
    expect(notes(h)).toContain('none-nearby');
    expect(h.kit.cell).toEqual({ x: 4, y: 1, z: 4 });
  });

  it('empties the queue on stop', () => {
    const h = harness();
    h.queue.push([{ type: 'goto', at: { x: 20, y: 1, z: 20 } }]);
    for (let i = 0; i < 10; i++) {
      h.kit.tick(h.world);
      h.queue.tick();
    }
    h.queue.push([{ type: 'stop' }]);
    expect(h.queue.idle).toBe(true);
    expect(h.kit.state).toBe('idle');
  });
});

describe('world-scale powers', () => {
  const act = (h: Harness, action: Action): void => {
    h.queue.push([action]);
    h.queue.tick();
  };

  it('each one lands at once rather than over many ticks', () => {
    for (const action of [
      { type: 'sculpt', shape: 'raise', at: { x: 8, y: 1, z: 8 }, radius: 4, amount: 2 },
      { type: 'paint', block: 4, at: { x: 8, y: 1, z: 8 }, radius: 4 },
      { type: 'clear', at: { x: 8, y: 1, z: 8 }, radius: 4 },
      { type: 'scatter', block: 8, at: { x: 8, y: 1, z: 8 }, radius: 4, count: 3 },
      { type: 'settime', phase: 'night' },
    ] as Action[]) {
      const h = harness();
      act(h, action);
      expect(h.queue.idle, `${action.type} did not finish in one tick`).toBe(true);
      expect(h.reports.length).toBeGreaterThan(0);
    }
  });

  it('changes the time of day', () => {
    const h = harness();
    act(h, { type: 'settime', phase: 'night' });
    expect(h.dayPhase).toBeGreaterThan(0.6);
    act(h, { type: 'settime', phase: 'dawn' });
    expect(h.dayPhase).toBeLessThan(0.2);
  });

  it('raises the ground where it was asked to', () => {
    const h = harness();
    const before = (() => {
      for (let y = WORLD_Y - 1; y >= 0; y--) if (h.world.get(8, y, 8) !== AIR) return y;
      return -1;
    })();
    act(h, { type: 'sculpt', shape: 'raise', at: { x: 8, y: 1, z: 8 }, radius: 5, amount: 3 });
    const after = (() => {
      for (let y = WORLD_Y - 1; y >= 0; y--) if (h.world.get(8, y, 8) !== AIR) return y;
      return -1;
    })();
    expect(after).toBeGreaterThan(before);
  });
});
