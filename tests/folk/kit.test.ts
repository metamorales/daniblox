import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/chunks';
import { Kit, WALK_SPEED } from '../../src/folk/kit';
import { isWalkable } from '../../src/folk/pathfinding';

function floor(size = 24): World {
  const world = new World(1);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) world.set(x, 0, z, 3);
  }
  return world;
}

function luciana(at = { x: 2, y: 1, z: 2 }): Kit {
  return new Kit({
    id: 'luciana',
    name: 'Luciana',
    appearance: { coat: '#fdf3e2', patch: '#332a4a' },
    at,
  });
}

/** Tick until the kit has finished working out a route. */
function think(kit: Kit, world: World): void {
  for (let i = 0; i < 500 && kit.state === 'thinking'; i++) kit.tick(world);
}

/** Run ticks until the kit settles, or give up. */
function settle(kit: Kit, world: World, maxTicks = 400): number {
  let ticks = 0;
  let clock = 0;
  const now = (): number => (clock += 0.05);
  while (ticks < maxTicks) {
    kit.tick(world, now);
    ticks++;
    if (kit.state === 'idle' || kit.state === 'stuck') break;
  }
  return ticks;
}

describe('a kit standing still', () => {
  it('starts idle on the cell it was placed in', () => {
    const kit = luciana();
    expect(kit.cell).toEqual({ x: 2, y: 1, z: 2 });
    expect(kit.state).toBe('idle');
  });

  it('stays put when nothing is asked of it', () => {
    const world = floor();
    const kit = luciana();
    for (let i = 0; i < 40; i++) kit.tick(world);
    expect(kit.cell).toEqual({ x: 2, y: 1, z: 2 });
    expect(kit.state).toBe('idle');
  });
});

describe('walking', () => {
  it('walks to a cell it was sent to', () => {
    const world = floor();
    const kit = luciana();
    kit.goTo(world, { x: 9, y: 1, z: 2 });
    settle(kit, world);
    expect(kit.state).toBe('idle');
    expect(kit.cell).toEqual({ x: 9, y: 1, z: 2 });
  });

  it('covers three blocks a second', () => {
    const world = floor();
    const kit = luciana();
    kit.goTo(world, { x: 20, y: 1, z: 2 });
    // Let the search finish first.
    think(kit, world);
    const from = kit.position.x;
    for (let i = 0; i < 20; i++) kit.tick(world);
    expect(kit.position.x - from).toBeCloseTo(WALK_SPEED, 1);
  });

  it('never moves more than one step in a tick, and never into a wall', () => {
    const world = floor();
    for (let z = 0; z < 8; z++) {
      world.set(5, 1, z, 3);
      world.set(5, 2, z, 3);
    }
    const kit = luciana();
    kit.goTo(world, { x: 9, y: 1, z: 2 });

    let clock = 0;
    const now = (): number => (clock += 0.05);
    for (let i = 0; i < 400 && kit.state !== 'idle' && kit.state !== 'stuck'; i++) {
      const before = { ...kit.position };
      kit.tick(world, now);
      const moved = Math.hypot(
        kit.position.x - before.x,
        kit.position.y - before.y,
        kit.position.z - before.z,
      );
      expect(moved, 'the kit teleported').toBeLessThanOrEqual(WALK_SPEED / 20 + 0.001);
      const cell = kit.cell;
      expect(
        isWalkable(world, cell.x, cell.y, cell.z),
        `the kit clipped into a block at ${JSON.stringify(cell)}`,
      ).toBe(true);
    }
    expect(kit.cell).toEqual({ x: 9, y: 1, z: 2 });
  });

  it('turns to face the way it is going', () => {
    const world = floor();
    const kit = luciana();
    kit.goTo(world, { x: 2, y: 1, z: 10 });
    think(kit, world);
    for (let i = 0; i < 5; i++) kit.tick(world);
    // Heading along +z means a facing of zero.
    expect(Math.abs(kit.facing)).toBeLessThan(0.2);

    // Let it arrive before turning it, so the next heading is purely along x.
    settle(kit, world);
    kit.goTo(world, { x: 12, y: 1, z: 10 });
    think(kit, world);
    for (let i = 0; i < 5; i++) kit.tick(world);
    // Heading along +x is a quarter turn.
    expect(kit.facing).toBeCloseTo(Math.PI / 2, 1);
  });

  it('stops on command and abandons its route', () => {
    const world = floor();
    const kit = luciana();
    kit.goTo(world, { x: 20, y: 1, z: 2 });
    think(kit, world);
    for (let i = 0; i < 5; i++) kit.tick(world);
    kit.stop();
    const where = { ...kit.position };
    for (let i = 0; i < 20; i++) kit.tick(world);
    expect(kit.state).toBe('idle');
    expect(kit.position.x).toBeCloseTo(where.x, 5);
    expect(kit.remainingPath).toHaveLength(0);
  });
});

describe('gravity', () => {
  it('falls when the block underneath is taken away', () => {
    const world = floor();
    for (let y = 1; y <= 6; y++) world.set(2, y, 2, 3);
    const kit = luciana({ x: 2, y: 7, z: 2 });
    expect(kit.cell.y).toBe(7);

    // Pull the whole column out from under it.
    for (let y = 1; y <= 6; y++) world.set(2, y, 2, 0);
    for (let i = 0; i < 100; i++) kit.tick(world);

    expect(kit.state).toBe('idle');
    expect(kit.cell.y).toBe(1);
  });

  it('never ends a fall inside a block', () => {
    const world = floor();
    for (let y = 1; y <= 4; y++) world.set(5, y, 5, 3);
    const kit = luciana({ x: 5, y: 5, z: 5 });
    world.set(5, 4, 5, 0);
    world.set(5, 3, 5, 0);
    for (let i = 0; i < 100; i++) kit.tick(world);
    const cell = kit.cell;
    expect(isWalkable(world, cell.x, cell.y, cell.z)).toBe(true);
  });
});

describe('when it cannot get there', () => {
  it('reports being stuck rather than walking into nothing', () => {
    const world = floor();
    const kit = luciana();
    // A target in mid-air, far away and unreachable.
    kit.goTo(world, { x: 20, y: 25, z: 20 });
    settle(kit, world, 2000);
    expect(kit.state).toBe('stuck');
    expect(kit.lastProblem).not.toBeNull();
  });

  it('accepts a near miss when the target itself is walled in', () => {
    const world = floor();
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      world.set(9 + (dx ?? 0), 1, 9 + (dz ?? 0), 3);
      world.set(9 + (dx ?? 0), 2, 9 + (dz ?? 0), 3);
    }
    const kit = luciana();
    kit.goTo(world, { x: 9, y: 1, z: 9 });
    settle(kit, world, 2000);
    expect(kit.state).toBe('idle');
    expect(kit.lastProblem).toBe('near-miss');
    // It got as close as the rules allow.
    const cell = kit.cell;
    expect(Math.abs(cell.x - 9) + Math.abs(cell.z - 9)).toBeLessThanOrEqual(3);
  });

  it('replans around a wall thrown up in front of it', () => {
    const world = floor();
    const kit = luciana();
    kit.goTo(world, { x: 20, y: 1, z: 2 });
    think(kit, world);
    for (let i = 0; i < 10; i++) kit.tick(world);

    const routeBefore = kit.remainingPath.map((c) => `${String(c.x)},${String(c.z)}`);
    expect(routeBefore).toContain('12,2');

    // Wall off the route ahead, two high so it cannot be climbed.
    world.set(12, 1, 2, 3);
    world.set(12, 2, 2, 3);
    settle(kit, world, 2000);

    // It still arrives, but not by walking through the wall.
    expect(kit.state).toBe('idle');
    expect(kit.cell).toEqual({ x: 20, y: 1, z: 2 });
    expect(
      kit.remainingPath.map((c) => `${String(c.x)},${String(c.z)}`),
      'the kit kept its stale route',
    ).not.toContain('12,2');
  });

  it('walks off a cut ledge and keeps going on the ground below', () => {
    const world = floor();
    // A narrow bridge, with nothing either side but the solid ground under
    // the world.
    for (let x = 0; x < 24; x++) {
      for (let z = 0; z < 24; z++) if (z !== 2) world.set(x, 0, z, 0);
    }
    const kit = luciana();
    kit.goTo(world, { x: 20, y: 1, z: 2 });
    think(kit, world);
    for (let i = 0; i < 10; i++) kit.tick(world);

    world.set(12, 0, 2, 0);
    settle(kit, world, 2000);

    // The drop is one block, well inside the fall limit, so it carries on.
    expect(kit.state).toBe('idle');
    const cell = kit.cell;
    expect(isWalkable(world, cell.x, cell.y, cell.z)).toBe(true);
  });
});
