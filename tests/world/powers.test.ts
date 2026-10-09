import { describe, expect, it } from 'vitest';
import { AIR } from '../../src/world/blocks';
import { WORLD_Y, World } from '../../src/world/chunks';
import { clearArea, paint, plant, scatter, sculpt } from '../../src/world/powers';
import { hashBytes } from '../../src/world/random';
import { generate } from '../../src/world/terrain';

function meadow(seed = 2024): World {
  const world = new World(seed);
  generate(world);
  return world;
}

function surface(world: World, x: number, z: number): number {
  for (let y = WORLD_Y - 1; y >= 0; y--) if (world.get(x, y, z) !== AIR) return y;
  return -1;
}

const MIDDLE = { x: 32, y: 14, z: 32 };

describe('sculpt', () => {
  it('raises a dome, highest at the middle', () => {
    const world = meadow();
    const before = surface(world, 32, 32);
    const edge = surface(world, 32 + 7, 32);

    const result = sculpt(world, { shape: 'raise', at: MIDDLE, radius: 8, amount: 4 });
    expect(result.changed).toBeGreaterThan(0);

    const middleRise = surface(world, 32, 32) - before;
    const edgeRise = surface(world, 32 + 7, 32) - edge;
    expect(middleRise).toBeGreaterThan(0);
    // A dome, not a cylinder: the middle climbs further than the rim.
    expect(middleRise).toBeGreaterThan(edgeRise);
  });

  it('lowers the ground', () => {
    const world = meadow();
    const before = surface(world, 32, 32);
    sculpt(world, { shape: 'lower', at: MIDDLE, radius: 6, amount: 3 });
    expect(surface(world, 32, 32)).toBeLessThan(before);
  });

  it('flattens a slope to one level', () => {
    const world = meadow();
    sculpt(world, { shape: 'flatten', at: MIDDLE, radius: 7, amount: 1 });
    const heights = new Set<number>();
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        if (Math.hypot(dx, dz) > 4) continue;
        heights.add(surface(world, 32 + dx, 32 + dz));
      }
    }
    expect(heights.size).toBe(1);
  });

  it('stays inside its radius', () => {
    const world = meadow();
    const far = surface(world, 32 + 12, 32);
    sculpt(world, { shape: 'raise', at: MIDDLE, radius: 5, amount: 4 });
    expect(surface(world, 32 + 12, 32)).toBe(far);
  });

  it('never pushes the world through its ceiling', () => {
    const world = meadow();
    for (let i = 0; i < 10; i++) {
      sculpt(world, { shape: 'raise', at: MIDDLE, radius: 4, amount: 8 });
    }
    expect(surface(world, 32, 32)).toBeLessThan(WORLD_Y);
  });
});

describe('paint', () => {
  it('recolours the surface and nothing beneath it', () => {
    const world = meadow();
    const top = surface(world, 32, 32);
    const below = world.get(32, top - 1, 32);
    paint(world, { block: 4, at: MIDDLE, radius: 5 });
    expect(world.get(32, top, 32)).toBe(4);
    expect(world.get(32, top - 1, 32)).toBe(below);
  });

  it('refuses a block that does not exist', () => {
    const result = paint(meadow(), { block: 99, at: MIDDLE, radius: 4 });
    expect(result.changed).toBe(0);
    expect(result.problem).toBe('unknown-block');
  });
});

describe('clear', () => {
  it('takes away trees and crystals but leaves the ground', () => {
    const world = meadow();
    // Build something to be cleared.
    world.set(32, surface(world, 32, 32) + 1, 32, 7);
    const groundBefore = surface(world, 40, 40);

    clearArea(world, { at: MIDDLE, radius: 10 });

    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        if (Math.hypot(dx, dz) > 8) continue;
        const x = 32 + dx;
        const z = 32 + dz;
        const top = world.get(x, surface(world, x, z), z);
        // Only ground types survive.
        expect([1, 2, 3, 4]).toContain(top);
      }
    }
    // Outside the radius nothing moved.
    expect(surface(world, 40, 40)).toBe(groundBefore);
  });
});

describe('scatter', () => {
  it('puts the asked-for number on the surface', () => {
    const world = meadow();
    const result = scatter(world, { block: 8, at: MIDDLE, radius: 8, count: 12 }, 7);
    expect(result.changed).toBe(12);

    let found = 0;
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        for (let y = 0; y < WORLD_Y; y++) if (world.get(32 + dx, y, 32 + dz) === 8) found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(12);
  });

  it('lands in the same places twice for the same seed', () => {
    const a = meadow();
    const b = meadow();
    scatter(a, { block: 8, at: MIDDLE, radius: 8, count: 10 }, 42);
    scatter(b, { block: 8, at: MIDDLE, radius: 8, count: 10 }, 42);
    expect(hashBytes(a.toBytes())).toBe(hashBytes(b.toBytes()));
  });

  it('caps at the schema limit however many are asked for', () => {
    const world = meadow();
    const result = scatter(world, { block: 8, at: MIDDLE, radius: 16, count: 999 }, 1);
    expect(result.changed).toBeLessThanOrEqual(32);
  });
});

describe('plant', () => {
  it('grows trees with trunks and leaves', () => {
    const world = meadow();
    clearArea(world, { at: MIDDLE, radius: 12 });
    const result = plant(world, { at: MIDDLE, radius: 10, count: 5 }, 3);
    expect(result.changed).toBeGreaterThan(0);

    let bark = 0;
    let sprout = 0;
    for (let dx = -12; dx <= 12; dx++) {
      for (let dz = -12; dz <= 12; dz++) {
        for (let y = 0; y < WORLD_Y; y++) {
          const id = world.get(32 + dx, y, 32 + dz);
          if (id === 5) bark++;
          if (id === 6) sprout++;
        }
      }
    }
    expect(bark).toBeGreaterThanOrEqual(result.changed * 2);
    expect(sprout).toBeGreaterThan(bark);
  });

  it('keeps trees apart rather than growing one green blob', () => {
    const world = meadow();
    clearArea(world, { at: MIDDLE, radius: 14 });
    plant(world, { at: MIDDLE, radius: 12, count: 8 }, 5);

    const trunks: [number, number][] = [];
    for (let dx = -14; dx <= 14; dx++) {
      for (let dz = -14; dz <= 14; dz++) {
        for (let y = 0; y < WORLD_Y; y++) {
          if (world.get(32 + dx, y, 32 + dz) === 5 && world.get(32 + dx, y - 1, 32 + dz) !== 5) {
            trunks.push([32 + dx, 32 + dz]);
          }
        }
      }
    }
    for (let i = 0; i < trunks.length; i++) {
      for (let j = i + 1; j < trunks.length; j++) {
        const a = trunks[i];
        const b = trunks[j];
        if (!a || !b) continue;
        expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeGreaterThan(2);
      }
    }
  });

  it('says so when there is nowhere to plant', () => {
    const world = new World(1); // empty: no ground at all
    const result = plant(world, { at: MIDDLE, radius: 6, count: 3 }, 1);
    expect(result.changed).toBe(0);
    expect(result.problem).toBe('nowhere-to-plant');
  });
});

describe('every power', () => {
  it('leaves the world loadable and the same size', () => {
    const world = meadow();
    sculpt(world, { shape: 'raise', at: MIDDLE, radius: 6, amount: 3 });
    paint(world, { block: 4, at: MIDDLE, radius: 4 });
    scatter(world, { block: 8, at: MIDDLE, radius: 6, count: 5 }, 1);
    plant(world, { at: MIDDLE, radius: 8, count: 3 }, 1);
    clearArea(world, { at: { x: 10, y: 14, z: 10 }, radius: 4 });

    const bytes = world.toBytes();
    expect(bytes.length).toBe(16 * 8192);
    const restored = new World(world.seed);
    restored.loadBytes(bytes);
    expect(hashBytes(restored.toBytes())).toBe(hashBytes(bytes));
  });
});
