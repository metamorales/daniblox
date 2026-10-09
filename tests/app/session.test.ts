import { describe, expect, it } from 'vitest';
import { encodeVoxels, serialize, type SaveFile } from '../../src/app/persistence';
import { DEFAULT_SEED, openSession } from '../../src/app/session';
import { World } from '../../src/world/chunks';
import { generate } from '../../src/world/terrain';

function storageWith(text: string | null, options: { getThrows?: boolean } = {}): () => Storage {
  const held = new Map<string, string>();
  if (text !== null) held.set('daniblox:v1', text);
  return () =>
    ({
      length: held.size,
      key: () => null,
      getItem: (key: string) => {
        if (options.getThrows) throw new Error('off');
        return held.get(key) ?? null;
      },
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
      clear: () => held.clear(),
    }) as Storage;
}

function saveFor(seed: number): string {
  const world = new World(seed);
  generate(world);
  world.set(3, 12, 3, 7);
  const save: SaveFile = {
    version: 1,
    seed,
    voxels: encodeVoxels(world.toBytes()),
    kits: [],
    chat: [],
    settings: {
      preferences: { theme: 'system', motion: 'system', renderDistance: 'auto' },
      model: { provider: 'openai', baseUrl: '', model: '', remember: false, active: false },
    },
  };
  return serialize(save);
}

describe('what a visit starts from', () => {
  it('is a fresh meadow with nothing saved and no link', () => {
    const session = openSession('', storageWith(null));
    expect(session.seed).toBe(DEFAULT_SEED);
    expect(session.save).toBeNull();
    expect(session.notes).toEqual([]);
  });

  it('is the save when there is one', () => {
    const session = openSession('', storageWith(saveFor(77)));
    expect(session.seed).toBe(77);
    expect(session.voxels?.length).toBe(131072);
    expect(session.sharedUntilEdit).toBe(false);
  });

  it('is the shared world when a link points elsewhere, with the save kept', () => {
    const session = openSession('#s=5', storageWith(saveFor(77)));
    expect(session.seed).toBe(5);
    expect(session.voxels).toBeNull();
    expect(session.sharedUntilEdit).toBe(true);
    expect(session.notes.join(' ')).toMatch(/shared world/i);
  });

  it('is the save when a seed-only link names the world already saved', () => {
    const session = openSession('#s=77', storageWith(saveFor(77)));
    expect(session.seed).toBe(77);
    expect(session.voxels).not.toBeNull();
    expect(session.sharedUntilEdit).toBe(false);
  });

  it('falls back from a damaged link and says so', () => {
    const withSave = openSession('#s=x', storageWith(saveFor(77)));
    expect(withSave.seed).toBe(77);
    expect(withSave.notes.join(' ')).toMatch(/damaged/i);
    const without = openSession('#s=x', storageWith(null));
    expect(without.seed).toBe(DEFAULT_SEED);
    expect(without.notes.join(' ')).toMatch(/fresh/i);
  });

  it('protects a save from a newer build and says storage is off when it is', () => {
    const newer = openSession('', storageWith(saveFor(3).replace('"version":1', '"version":2')));
    expect(newer.protectSave).toBe(true);
    expect(newer.seed).toBe(DEFAULT_SEED);
    const off = openSession('', storageWith(null, { getThrows: true }));
    expect(off.store.kind).toBe('memory');
    expect(off.notes.join(' ')).toMatch(/switched off/i);
  });
});
