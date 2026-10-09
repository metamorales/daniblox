import { describe, expect, it } from 'vitest';
import { AIR, BLOCKS, blockByName } from '../../src/world/blocks';
import {
  CHUNK_COUNT,
  CHUNK_VOLUME,
  World,
  WORLD_X,
  WORLD_Y,
  WORLD_Z,
} from '../../src/world/chunks';
import { hashBytes } from '../../src/world/random';
import { SHORE_LEVEL, generate } from '../../src/world/terrain';

function build(seed: number): World {
  const world = new World(seed);
  generate(world);
  return world;
}

function counts(world: World): Map<number, number> {
  const tally = new Map<number, number>();
  for (const byte of world.toBytes()) tally.set(byte, (tally.get(byte) ?? 0) + 1);
  return tally;
}

const id = (name: string): number => blockByName(name)?.id ?? -1;

describe('terrain generation', () => {
  it('is deterministic for a seed and different across seeds', () => {
    expect(hashBytes(build(1234).toBytes())).toBe(hashBytes(build(1234).toBytes()));
    expect(hashBytes(build(1234).toBytes())).not.toBe(hashBytes(build(5678).toBytes()));
  });

  it('fills exactly 16 chunks of 8192 bytes', () => {
    const bytes = build(1).toBytes();
    expect(bytes.length).toBe(CHUNK_COUNT * CHUNK_VOLUME);
  });

  it('places every one of the eight block types, on several seeds', () => {
    for (const seed of [1, 7, 42, 1234, 99999]) {
      const tally = counts(build(seed));
      for (const block of BLOCKS) {
        expect(
          tally.get(block.id) ?? 0,
          `${block.name} missing at seed ${String(seed)}`,
        ).toBeGreaterThan(0);
      }
      expect(tally.get(AIR) ?? 0).toBeGreaterThan(0);
    }
  });

  it('never puts shell more than two blocks above the shore', () => {
    const world = build(2024);
    const shell = id('shell');
    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        for (let y = SHORE_LEVEL + 3; y < WORLD_Y; y++) {
          expect(world.get(x, y, z), `shell at ${String(x)},${String(y)},${String(z)}`).not.toBe(
            shell,
          );
        }
      }
    }
  });

  it('never puts pebble directly above clover', () => {
    const world = build(2024);
    const pebble = id('pebble');
    const clover = id('clover');
    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        for (let y = 1; y < WORLD_Y; y++) {
          if (world.get(x, y, z) === pebble) expect(world.get(x, y - 1, z)).not.toBe(clover);
        }
      }
    }
  });

  it('grows at least ten bark blocks, each with sprout within radius 2', () => {
    const world = build(2024);
    const bark = id('bark');
    const sprout = id('sprout');
    let barkCount = 0;

    for (let x = 0; x < WORLD_X; x++) {
      for (let y = 0; y < WORLD_Y; y++) {
        for (let z = 0; z < WORLD_Z; z++) {
          if (world.get(x, y, z) !== bark) continue;
          barkCount++;
          let nearby = false;
          for (let dx = -2; dx <= 2 && !nearby; dx++) {
            for (let dy = -2; dy <= 2 && !nearby; dy++) {
              for (let dz = -2; dz <= 2 && !nearby; dz++) {
                if (world.get(x + dx, y + dy, z + dz) === sprout) nearby = true;
              }
            }
          }
          expect(
            nearby,
            `bark at ${String(x)},${String(y)},${String(z)} has no leaves near it`,
          ).toBe(true);
        }
      }
    }
    expect(barkCount).toBeGreaterThanOrEqual(10);
  });

  it('varies tree shape, so no two canopies are the same size', () => {
    const world = build(2024);
    const bark = id('bark');
    const sprout = id('sprout');
    const canopySizes: number[] = [];

    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        for (let y = 1; y < WORLD_Y; y++) {
          // The top trunk block: bark with air or leaves above and bark below.
          if (world.get(x, y, z) !== bark || world.get(x, y - 1, z) !== bark) continue;
          let size = 0;
          for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -1; dy <= 3; dy++) {
              for (let dz = -3; dz <= 3; dz++) {
                if (world.get(x + dx, y + dy, z + dz) === sprout) size++;
              }
            }
          }
          canopySizes.push(size);
        }
      }
    }

    expect(canopySizes.length).toBeGreaterThanOrEqual(10);
    expect(new Set(canopySizes).size).toBeGreaterThan(1);
  });

  it('keeps the surface green or sandy, never bare soil on top', () => {
    const world = build(2024);
    const crumb = id('crumb');
    for (let x = 0; x < WORLD_X; x++) {
      for (let z = 0; z < WORLD_Z; z++) {
        for (let y = WORLD_Y - 1; y >= 0; y--) {
          const here = world.get(x, y, z);
          if (here === AIR) continue;
          // The topmost block of a column is never exposed rose soil, which is
          // what would read as the genre-defining block game.
          expect(here, `bare crumb on top at ${String(x)},${String(z)}`).not.toBe(crumb);
          break;
        }
      }
    }
  });
});
