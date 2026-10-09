import { describe, expect, it } from 'vitest';
import { AIR, BLOCKS, blockByName, isSolid, isUnlit, layerFor } from '../../src/world/blocks';
import {
  CHUNK_COUNT,
  CHUNK_VOLUME,
  CHUNK_X,
  CHUNK_Y,
  CHUNK_Z,
  World,
  WORLD_X,
  WORLD_Y,
  WORLD_Z,
  localIndex,
} from '../../src/world/chunks';

describe('world dimensions', () => {
  it('matches the spec: 64 by 64 by 32 in 16 by 16 by 32 chunks', () => {
    expect([WORLD_X, WORLD_Y, WORLD_Z]).toEqual([64, 32, 64]);
    expect([CHUNK_X, CHUNK_Y, CHUNK_Z]).toEqual([16, 32, 16]);
    expect(CHUNK_COUNT).toBe(16);
    expect(CHUNK_VOLUME).toBe(8192);
  });

  it('gives every chunk its own 8192 byte array', () => {
    const world = new World(1);
    expect(world.chunks).toHaveLength(16);
    for (const chunk of world.chunks) expect(chunk.blocks.length).toBe(8192);
  });

  it('maps every local coordinate to a distinct index', () => {
    const seen = new Set<number>();
    for (let x = 0; x < CHUNK_X; x++) {
      for (let y = 0; y < CHUNK_Y; y++) {
        for (let z = 0; z < CHUNK_Z; z++) {
          const index = localIndex(x, y, z);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(CHUNK_VOLUME);
          seen.add(index);
        }
      }
    }
    expect(seen.size).toBe(CHUNK_VOLUME);
  });
});

describe('block access', () => {
  it('reads back what it writes anywhere in the world', () => {
    const world = new World(1);
    const probes: [number, number, number][] = [
      [0, 0, 0],
      [63, 31, 63],
      [16, 5, 16],
      [31, 0, 48],
      [47, 17, 15],
    ];
    for (const [x, y, z] of probes) {
      expect(world.set(x, y, z, 7)).toBe(true);
      expect(world.get(x, y, z)).toBe(7);
    }
  });

  it('returns air outside the world instead of throwing', () => {
    const world = new World(1);
    const outside: [number, number, number][] = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [64, 0, 0],
      [0, 32, 0],
      [0, 0, 64],
    ];
    for (const [x, y, z] of outside) expect(world.get(x, y, z)).toBe(AIR);
    expect(world.set(-1, 0, 0, 1)).toBe(false);
  });

  it('marks the neighbour chunk dirty when a block sits on a seam', () => {
    const world = new World(1);
    for (const chunk of world.chunks) chunk.dirty = false;

    // x = 16 is the first column of chunk (1, 0), so chunk (0, 0) must remesh too.
    world.set(16, 4, 20, 3);
    expect(world.chunkAt(1, 1)?.dirty).toBe(true);
    expect(world.chunkAt(0, 1)?.dirty).toBe(true);
    expect(world.chunkAt(2, 1)?.dirty).toBe(false);
  });

  it('does not dirty anything when the block is unchanged', () => {
    const world = new World(1);
    world.set(5, 5, 5, 2);
    for (const chunk of world.chunks) chunk.dirty = false;
    expect(world.set(5, 5, 5, 2)).toBe(false);
    expect(world.chunks.every((c) => !c.dirty)).toBe(true);
  });
});

describe('save round-trip', () => {
  it('restores every block through toBytes and loadBytes', () => {
    const world = new World(9);
    world.set(1, 2, 3, 4);
    world.set(60, 30, 60, 8);
    const bytes = world.toBytes();
    expect(bytes.length).toBe(CHUNK_COUNT * CHUNK_VOLUME);

    const restored = new World(9);
    restored.loadBytes(bytes);
    expect(restored.get(1, 2, 3)).toBe(4);
    expect(restored.get(60, 30, 60)).toBe(8);
    expect(restored.toBytes()).toEqual(bytes);
  });

  it('rejects data of the wrong length', () => {
    expect(() => new World(1).loadBytes(new Uint8Array(10))).toThrow(/must be 131072 bytes/);
  });
});

describe('block registry', () => {
  it('registers exactly the eight blocks from the plan', () => {
    expect(BLOCKS.map((b) => b.name)).toEqual([
      'crumb',
      'clover',
      'pebble',
      'shell',
      'bark',
      'sprout',
      'tile',
      'gem',
    ]);
  });

  it('gives every block a unique id, name and colour', () => {
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(8);
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(8);
    expect(new Set(BLOCKS.map((b) => b.colour)).size).toBe(8);
    for (const block of BLOCKS) expect(block.id).not.toBe(AIR);
  });

  it('resolves names and synonyms, ignoring case and space', () => {
    expect(blockByName('clover')?.name).toBe('clover');
    expect(blockByName('  GRASS ')?.name).toBe('clover');
    expect(blockByName('wood')?.name).toBe('bark');
    expect(blockByName('crystal')?.name).toBe('gem');
    expect(blockByName('nonsense')).toBeUndefined();
  });

  it('never maps one word to two different blocks', () => {
    const words = BLOCKS.flatMap((b) => [b.name, ...b.synonyms]);
    expect(new Set(words).size).toBe(words.length);
  });

  it('treats air as not solid and gem as the only unlit block', () => {
    expect(isSolid(AIR)).toBe(false);
    for (const block of BLOCKS) expect(isSolid(block.id)).toBe(true);
    expect(BLOCKS.filter((b) => b.unlit).map((b) => b.name)).toEqual(['gem']);
    expect(isUnlit(8)).toBe(true);
    expect(isUnlit(1)).toBe(false);
  });

  it('keeps clover green on every face so no cube caps a brown one', () => {
    const clover = blockByName('clover');
    expect(clover).toBeDefined();
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
    const layers = faces.map((f) => layerFor(clover?.id ?? 0, f));
    // Top differs (it carries the flowers) but no face falls back to a soil tile.
    expect(new Set(layers).size).toBe(2);
    expect(layers.every((l) => l === 1 || l === 2)).toBe(true);
  });
});
