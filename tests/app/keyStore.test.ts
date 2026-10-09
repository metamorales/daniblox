import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetKey, getKey, isRemembered, restoreKey, setKey } from '../../src/app/keyStore';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    api: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    } as Storage,
  };
}

let session: ReturnType<typeof fakeStorage>;
let local: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  session = fakeStorage();
  local = fakeStorage();
  vi.stubGlobal('sessionStorage', session.api);
  vi.stubGlobal('localStorage', local.api);
  forgetKey();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CANARY = 'sk-test-canary-do-not-store';

describe('where the key lives', () => {
  it('stays in memory and nowhere else by default', () => {
    setKey(CANARY, false);
    expect(getKey()).toBe(CANARY);
    expect(session.map.size).toBe(0);
    expect(local.map.size).toBe(0);
  });

  it('never reaches localStorage, even when remembered', () => {
    setKey(CANARY, true);
    expect(session.map.size).toBe(1);
    // The one rule that is not negotiable: nothing durable, ever.
    expect(local.map.size).toBe(0);
    for (const value of local.map.values()) expect(value).not.toContain(CANARY);
  });

  it('comes back within the tab when remembered, and not otherwise', () => {
    setKey(CANARY, true);
    forgetKey();
    // forgetKey clears the stored copy too.
    expect(restoreKey()).toBe('');

    setKey(CANARY, true);
    expect(restoreKey()).toBe(CANARY);
    expect(isRemembered()).toBe(true);
  });

  it('drops the stored copy when the player stops remembering', () => {
    setKey(CANARY, true);
    expect(session.map.size).toBe(1);
    setKey(CANARY, false);
    expect(session.map.size).toBe(0);
    expect(getKey()).toBe(CANARY);
  });

  it('forgets it completely on request', () => {
    setKey(CANARY, true);
    forgetKey();
    expect(getKey()).toBe('');
    expect(isRemembered()).toBe(false);
    expect(session.map.size).toBe(0);
  });

  it('still works when storage is switched off entirely', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    vi.stubGlobal('sessionStorage', throwing);

    expect(() => {
      setKey(CANARY, true);
    }).not.toThrow();
    expect(getKey()).toBe(CANARY);
    expect(isRemembered()).toBe(false);
    expect(restoreKey()).toBe('');
  });
});
