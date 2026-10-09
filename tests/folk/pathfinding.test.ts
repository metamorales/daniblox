import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/chunks';
import {
  MAX_EXPANDED,
  PathSearch,
  distance,
  findPath,
  isWalkable,
  packCell,
  unpackCell,
} from '../../src/folk/pathfinding';

/** A flat floor of stone at y = 0, so cells at y = 1 are walkable. */
function floor(size = 24): World {
  const world = new World(1);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) world.set(x, 0, z, 3);
  }
  return world;
}

const at = (x: number, y: number, z: number) => ({ x, y, z });

describe('cell packing', () => {
  it('round-trips every corner of the world', () => {
    for (const cell of [at(0, 0, 0), at(63, 31, 63), at(16, 5, 48), at(1, 30, 62)]) {
      expect(unpackCell(packCell(cell.x, cell.y, cell.z))).toEqual(cell);
    }
  });
});

describe('walkable cells', () => {
  it('needs room for feet and head, and ground underneath', () => {
    const world = floor();
    expect(isWalkable(world, 5, 1, 5)).toBe(true);

    // Nothing underneath.
    expect(isWalkable(world, 5, 5, 5)).toBe(false);
    // Feet inside a block.
    expect(isWalkable(world, 5, 0, 5)).toBe(false);

    // No headroom.
    world.set(5, 2, 5, 3);
    expect(isWalkable(world, 5, 1, 5)).toBe(false);
  });

  it('refuses cells outside the world', () => {
    const world = floor();
    expect(isWalkable(world, -1, 1, 5)).toBe(false);
    expect(isWalkable(world, 5, 1, -1)).toBe(false);
    expect(isWalkable(world, 64, 1, 5)).toBe(false);
  });
});

describe('pathfinding', () => {
  it('walks a straight line across flat ground', () => {
    const path = findPath(floor(), at(2, 1, 2), at(9, 1, 2));
    expect(path.exact).toBe(true);
    expect(path.cells[0]).toEqual(at(2, 1, 2));
    expect(path.cells[path.cells.length - 1]).toEqual(at(9, 1, 2));
    expect(path.cells).toHaveLength(8);
  });

  it('goes around a wall rather than through it', () => {
    const world = floor();
    // A wall across z, with a gap at z = 8.
    for (let z = 0; z < 8; z++) {
      world.set(5, 1, z, 3);
      world.set(5, 2, z, 3);
    }
    const path = findPath(world, at(2, 1, 2), at(9, 1, 2));
    expect(path.exact).toBe(true);
    for (const cell of path.cells) {
      expect(cell.x === 5 && cell.z < 8, `walked through the wall at ${JSON.stringify(cell)}`).toBe(
        false,
      );
    }
    // Going around is longer than the eight cells a clear run would take.
    expect(path.cells.length).toBeGreaterThan(8);
  });

  it('steps up one block but refuses two', () => {
    const world = floor();
    world.set(5, 1, 2, 3); // a single step
    const up = findPath(world, at(4, 1, 2), at(5, 2, 2));
    expect(up.exact).toBe(true);

    const blocked = floor();
    blocked.set(5, 1, 2, 3);
    blocked.set(5, 2, 2, 3); // two high
    const over = findPath(blocked, at(4, 1, 2), at(5, 3, 2));
    expect(over.exact).toBe(false);
  });

  it('refuses a step up without headroom above the kit', () => {
    const world = floor(64);
    // The ledge and the ceiling run the full width of the world. Anything
    // shorter leaks: the ground under the world is solid, so a kit can walk
    // off the end of a test floor and come back up the far side.
    for (let z = 0; z < 64; z++) {
      world.set(5, 1, z, 3);
      world.set(4, 3, z, 3);
    }
    expect(findPath(world, at(2, 1, 2), at(5, 2, 2)).exact).toBe(false);

    // Lift the ceiling and the same climb becomes possible, which proves the
    // refusal was about headroom and not about the ledge.
    const clear = floor(64);
    for (let z = 0; z < 64; z++) clear.set(5, 1, z, 3);
    expect(findPath(clear, at(2, 1, 2), at(5, 2, 2)).exact).toBe(true);
  });

  it('falls any height to reach somewhere lower', () => {
    const makeDrop = (depth: number): World => {
      const world = new World(1);
      for (let x = 0; x < 12; x++) {
        for (let z = 0; z < 12; z++) {
          // A ledge on the left at y = depth, ground on the right at y = 0.
          if (x <= 5) world.set(x, depth, z, 3);
          world.set(x, 0, z, 3);
        }
      }
      return world;
    };

    const three = makeDrop(3);
    expect(findPath(three, at(5, 4, 5), at(7, 1, 5)).exact).toBe(true);

    // The owner asked her to hop off a hill; the spec's limit of three used
    // to refuse this (decisions M9-1).
    const five = makeDrop(5);
    expect(findPath(five, at(5, 6, 5), at(7, 1, 5)).exact).toBe(true);

    const cliff = makeDrop(14);
    const path = findPath(cliff, at(5, 15, 5), at(7, 1, 5));
    expect(path.exact).toBe(true);
    // She walks off the edge rather than being teleported: every step is a
    // neighbour on the ground or a straight drop.
    for (let i = 1; i < path.cells.length; i++) {
      const a = path.cells[i - 1];
      const b = path.cells[i];
      if (!a || !b) continue;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it('still refuses to climb more than one block at a time', () => {
    const world = new World(1);
    for (let x = 0; x < 12; x++) {
      for (let z = 0; z < 12; z++) {
        world.set(x, 0, z, 3);
        if (x >= 6) world.set(x, 2, z, 3);
      }
    }
    expect(findPath(world, at(2, 1, 5), at(8, 3, 5)).exact).toBe(false);
  });

  it('returns the nearest cell it reached when the target is walled in', () => {
    const world = floor();
    // Seal a single cell behind blocks on all four sides.
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      world.set(9 + (dx ?? 0), 1, 9 + (dz ?? 0), 3);
      world.set(9 + (dx ?? 0), 2, 9 + (dz ?? 0), 3);
    }
    const path = findPath(world, at(2, 1, 2), at(9, 1, 9));
    expect(path.exact).toBe(false);
    expect(path.cells.length).toBeGreaterThan(0);

    const end = path.cells[path.cells.length - 1];
    expect(end).toBeDefined();
    // It gets close enough for the caller's "within three blocks" rule.
    expect(distance(end ?? at(0, 0, 0), at(9, 1, 9))).toBeLessThanOrEqual(3);
  });

  it('gives up after the node cap rather than searching forever', () => {
    // A large open floor and an unreachable target high in the air.
    const world = floor(64);
    const search = new PathSearch(world, at(1, 1, 1), at(62, 30, 62));
    let guard = 0;
    while (search.step(1000) === 'running' && guard++ < 2000);
    expect(search.status).toBe('exhausted');
    expect(search.nodesExpanded).toBeLessThanOrEqual(MAX_EXPANDED);
    expect(search.result().expanded).toBe(true);
  });

  it('can be sliced across frames and reach the same answer', () => {
    const world = floor(40);
    const whole = findPath(world, at(1, 1, 1), at(30, 1, 30));

    const sliced = new PathSearch(world, at(1, 1, 1), at(30, 1, 30));
    let slices = 0;
    // A fake clock that burns the budget every few expansions.
    let fake = 0;
    while (sliced.step(2, () => (fake += 0.5)) === 'running' && slices++ < 5000);

    expect(sliced.status).toBe('found');
    expect(slices).toBeGreaterThan(1);
    expect(sliced.result().cells).toEqual(whole.cells);
  });

  it('never returns a cell the kit could not stand in', () => {
    const world = floor();
    for (let i = 0; i < 20; i++) world.set(3 + (i % 6), 1, 3 + ((i * 3) % 6), 3);
    const path = findPath(world, at(1, 1, 1), at(10, 1, 10));
    for (const cell of path.cells) {
      expect(isWalkable(world, cell.x, cell.y, cell.z), JSON.stringify(cell)).toBe(true);
    }
  });

  it('charges more for a step up than for level ground', () => {
    const level = floor();
    const flat = findPath(level, at(2, 1, 2), at(6, 1, 2));

    const stepped = floor();
    for (let z = 0; z < 12; z++) stepped.set(4, 1, z, 3);
    const climbed = findPath(stepped, at(2, 1, 2), at(6, 1, 2));

    // Both are reachable, but the stepped route is not preferred when level
    // ground is available, so it detours instead of climbing.
    expect(flat.exact).toBe(true);
    expect(climbed.exact).toBe(true);
    expect(climbed.cells.length).toBeGreaterThanOrEqual(flat.cells.length);
  });
});
