import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  WARN_BYTES,
  decodeVoxels,
  encodeVoxels,
  measure,
  migrate,
  openStore,
  parseSave,
  serialize,
  type SaveFile,
} from '../../src/app/persistence';
import { World } from '../../src/world/chunks';
import { generate } from '../../src/world/terrain';

function sample(): SaveFile {
  const world = new World(42);
  generate(world);
  world.set(10, 12, 10, 7);
  return {
    version: 1,
    seed: 42,
    voxels: encodeVoxels(world.toBytes()),
    kits: [{ id: 'luciana', name: 'Luciana', at: { x: 32, y: 14, z: 32 }, inventory: [[5, 3]] }],
    chat: [
      { who: 'player', text: 'hello' },
      { who: 'kit', text: 'Hello. What are we doing?' },
    ],
    settings: {
      preferences: { theme: 'dark', motion: 'system', renderDistance: 'near', ambientModel: false },
      model: {
        provider: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        model: 'qwen3.5:9b',
        remember: false,
        active: true,
      },
    },
  };
}

/** A Storage stand-in whose failures can be chosen. */
function fakeStorage(options: { getThrows?: boolean; setThrows?: Error } = {}): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    key: (i: number) => [...held.keys()][i] ?? null,
    getItem(key: string) {
      if (options.getThrows) throw new Error('storage is off');
      return held.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.setThrows) throw options.setThrows;
      held.set(key, value);
    },
    removeItem(key: string) {
      held.delete(key);
    },
    clear() {
      held.clear();
    },
  };
}

describe('the save file', () => {
  it('survives a round trip, voxels and all', () => {
    const save = sample();
    const back = parseSave(serialize(save));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.save).toEqual(save);
    const voxels = decodeVoxels(back.save.voxels);
    expect(voxels?.length).toBe(131072);
    expect(voxels?.[((12 * 16 + 10) * 16 + 10) % 8192]).toBeDefined();
  });

  it('brings a version-0 document forward with sensible blanks', () => {
    const world = new World(7);
    generate(world);
    const out = migrate({ seed: 7, voxels: encodeVoxels(world.toBytes()) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.save.version).toBe(1);
    expect(out.save.kits).toEqual([]);
    expect(out.save.chat).toEqual([]);
    expect(out.save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('leaves a newer document alone rather than guessing', () => {
    expect(migrate({ ...sample(), version: 2 })).toEqual({ ok: false, reason: 'newer' });
  });

  it('refuses garbage, a truncated world, and anything with a key in it', () => {
    expect(parseSave('not json')).toEqual({ ok: false, reason: 'corrupt' });
    expect(parseSave('42')).toEqual({ ok: false, reason: 'corrupt' });
    expect(migrate({ ...sample(), voxels: 'AQID' })).toEqual({ ok: false, reason: 'corrupt' });

    const withKey = sample();
    const leaked = {
      ...withKey,
      settings: { ...withKey.settings, model: { ...withKey.settings.model, apiKey: 'sk-x' } },
    };
    expect(migrate(leaked)).toEqual({ ok: false, reason: 'corrupt' });
    expect(serialize(withKey)).not.toContain('apiKey');
  });

  it('warns past four megabytes', () => {
    expect(measure('x'.repeat(1000)).warn).toBe(false);
    expect(measure('x'.repeat(WARN_BYTES + 1)).warn).toBe(true);
  });
});

describe('the store', () => {
  it('uses localStorage when it works', () => {
    const storage = fakeStorage();
    const store = openStore(() => storage);
    expect(store.kind).toBe('local');
    expect(store.set('{"a":1}')).toBe('ok');
    expect(storage.getItem(SAVE_KEY)).toBe('{"a":1}');
    expect(store.get()).toBe('{"a":1}');
    store.remove();
    expect(store.get()).toBeNull();
  });

  it('falls back to memory when storage throws on the first touch', () => {
    const store = openStore(() => fakeStorage({ getThrows: true }));
    expect(store.kind).toBe('memory');
    expect(store.set('hello')).toBe('ok');
    expect(store.get()).toBe('hello');
  });

  it('falls back to memory when there is no storage at all', () => {
    const store = openStore(() => {
      throw new Error('no window here');
    });
    expect(store.kind).toBe('memory');
  });

  it('names a full store, and keeps going', () => {
    const quota = new Error('full');
    quota.name = 'QuotaExceededError';
    const store = openStore(() => fakeStorage({ setThrows: quota }));
    expect(store.set('big')).toBe('quota');
    const other = openStore(() => fakeStorage({ setThrows: new Error('odd') }));
    expect(other.set('x')).toBe('failed');
  });
});
