import { describe, expect, it } from 'vitest';
import { blockByName } from '../../src/world/blocks';
import { World } from '../../src/world/chunks';
import { STRUCTURES, blueprint } from '../../src/world/structures';

const BARK = blockByName('bark')?.id ?? -1;
const SHELL = blockByName('shell')?.id ?? -1;
const GEM = blockByName('gem')?.id ?? -1;

function flat(): World {
  const world = new World(1);
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.set(x, 5, z, 3);
  return world;
}

describe('blueprints', () => {
  it('stand on the ground of the site, whatever height was asked for', () => {
    const world = flat();
    const plan = blueprint('litterbox', { x: 20, y: 30, z: 20 }, world);
    expect(plan.cells.every((c) => c.y === 6)).toBe(true);
  });

  it('come out bottom up, so nothing floats while she works', () => {
    const world = flat();
    for (const kind of STRUCTURES) {
      const plan = blueprint(kind, { x: 20, y: 6, z: 20 }, world);
      for (let i = 1; i < plan.cells.length; i++) {
        expect(plan.cells[i]?.y ?? 0).toBeGreaterThanOrEqual(plan.cells[i - 1]?.y ?? 0);
      }
    }
  });

  it('the tower is fourteen bark and a gem on top, five high', () => {
    const plan = blueprint('tower', { x: 20, y: 6, z: 20 }, flat());
    expect(plan.bill.get(BARK)).toBe(14);
    expect(plan.bill.get(GEM)).toBe(1);
    expect(plan.cells).toHaveLength(15);
    const top = plan.cells[plan.cells.length - 1];
    expect(top).toMatchObject({ x: 20, y: 10, z: 20, block: GEM });
  });

  it('the house has a doorway, a room inside, and a roof', () => {
    const plan = blueprint('house', { x: 20, y: 6, z: 20 }, flat());
    expect(plan.bill.get(BARK)).toBe(23);
    expect([...plan.bill.keys()]).toEqual([BARK]);
    const has = (x: number, y: number, z: number): boolean =>
      plan.cells.some((c) => c.x === x && c.y === y && c.z === z);
    expect(has(20, 6, 19), 'the doorway is open at the bottom').toBe(false);
    expect(has(20, 7, 19), 'the doorway is open at head height').toBe(false);
    expect(has(20, 6, 20), 'the room is empty').toBe(false);
    expect(has(20, 7, 20), 'the room is empty above').toBe(false);
    expect(has(20, 8, 20), 'the roof covers the room').toBe(true);
    expect(has(19, 6, 20), 'a wall stands').toBe(true);
  });

  it('the litter box is a rim of bark around sand', () => {
    const plan = blueprint('litterbox', { x: 20, y: 6, z: 20 }, flat());
    expect(plan.bill.get(BARK)).toBe(8);
    expect(plan.bill.get(SHELL)).toBe(1);
    expect(plan.cells.find((c) => c.x === 20 && c.z === 20)?.block).toBe(SHELL);
  });

  it('leaves out what would fall off the edge of the world', () => {
    const plan = blueprint('house', { x: 0, y: 6, z: 0 }, flat());
    expect(plan.cells.every((c) => c.x >= 0 && c.z >= 0)).toBe(true);
    expect(plan.cells.length).toBeLessThan(23);
    expect(plan.bill.get(BARK)).toBe(plan.cells.length);
  });
});
