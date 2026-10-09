import { describe, expect, it } from 'vitest';
import { MAX_HASH_LENGTH, applyEdits, decodeShare, encodeShare } from '../../src/app/share';
import { World } from '../../src/world/chunks';
import { generate } from '../../src/world/terrain';

function worlds(seed = 99): { base: Uint8Array; world: World } {
  const world = new World(seed);
  generate(world);
  return { base: world.toBytes(), world };
}

describe('share links', () => {
  it('carry the seed and the edits, and come back whole', () => {
    const { base, world } = worlds();
    world.set(10, 12, 10, 7);
    world.set(11, 12, 10, 8);
    const ground = world.surfaceHeight(20, 20);
    world.set(20, ground, 20, 0);

    const link = encodeShare(99, base, world.toBytes());
    expect(link.complete).toBe(true);
    expect(link.hash).toMatch(/^#s=99&w=[A-Za-z0-9_-]+&h=[0-9a-f]{8}$/);

    const back = decodeShare(link.hash);
    expect(back.ok).toBe(true);
    if (!back.ok || !back.edits) return;
    expect(back.seed).toBe(99);
    expect(applyEdits(base, back.edits)).toEqual(world.toBytes());
  });

  it('are the seed alone when nothing changed', () => {
    const { base } = worlds(5);
    const link = encodeShare(5, base, base);
    expect(link).toEqual({ hash: '#s=5', complete: true });
    expect(decodeShare('#s=5')).toEqual({ ok: true, seed: 5, edits: null });
  });

  it('drop the edits, and say so, when the link would be too long', () => {
    const { base, world } = worlds(3);
    // A checkerboard of changes is the worst case for run-length coding.
    for (let x = 0; x < 64; x++) {
      for (let z = 0; z < 64; z++) if ((x + z) % 2 === 0) world.set(x, 20, z, 7);
    }
    const link = encodeShare(3, base, world.toBytes());
    expect(link.complete).toBe(false);
    expect(link.hash).toBe('#s=3');
    expect(link.hash.length).toBeLessThan(MAX_HASH_LENGTH);
  });

  it('notice a damaged link rather than loading it', () => {
    const { base, world } = worlds(8);
    world.set(1, 12, 1, 7);
    const good = encodeShare(8, base, world.toBytes()).hash;

    expect(decodeShare('')).toEqual({ ok: false, reason: 'none' });
    expect(decodeShare('#theme=dark')).toEqual({ ok: false, reason: 'none' });
    expect(decodeShare('#s=abc')).toEqual({ ok: false, reason: 'corrupt' });
    expect(decodeShare('#s=99999999999')).toEqual({ ok: false, reason: 'corrupt' });
    expect(decodeShare('#s=8&w=!!!&h=00000000')).toEqual({ ok: false, reason: 'corrupt' });
    expect(decodeShare(good.replace(/&h=[0-9a-f]+$/, '&h=deadbeef'))).toEqual({
      ok: false,
      reason: 'corrupt',
    });
    expect(decodeShare(good.slice(0, good.length - 40))).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('never carry anything but the seed, the edits and their checksum', () => {
    const { base, world } = worlds(11);
    world.set(2, 12, 2, 7);
    const link = encodeShare(11, base, world.toBytes());
    const keys = [...new URLSearchParams(link.hash.slice(1)).keys()].sort();
    expect(keys).toEqual(['h', 's', 'w']);
  });
});
