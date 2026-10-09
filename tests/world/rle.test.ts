import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, rleDecode, rleEncode } from '../../src/world/rle';

/** Deterministic pseudo-random bytes so a failure is always reproducible. */
function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state >>> 16) & 0xff;
  }
  return out;
}

describe('run-length encoding', () => {
  it('round-trips a 100-byte array through encode and decode', () => {
    const original = seededBytes(100, 42);
    const restored = rleDecode(rleEncode(original));
    expect(restored).toEqual(original);
    expect(restored.length).toBe(100);
  });

  it('round-trips a 100-byte array through base64 as well', () => {
    const original = seededBytes(100, 7);
    const restored = rleDecode(base64ToBytes(bytesToBase64(rleEncode(original))));
    expect(restored).toEqual(original);
  });

  it('compresses a long single-value run', () => {
    const original = new Uint8Array(4096).fill(3);
    const encoded = rleEncode(original);
    // 4096 / 255 = 17 runs, two bytes each.
    expect(encoded.length).toBe(34);
    expect(rleDecode(encoded)).toEqual(original);
  });

  it('never emits a run longer than 255', () => {
    const encoded = rleEncode(new Uint8Array(1000).fill(1));
    for (let i = 0; i < encoded.length; i += 2) expect(encoded[i]).toBeLessThanOrEqual(255);
  });

  it('handles an empty array', () => {
    expect(rleEncode(new Uint8Array(0))).toEqual(new Uint8Array(0));
    expect(rleDecode(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  it('rejects a malformed stream', () => {
    expect(() => rleDecode(new Uint8Array([5]))).toThrow(/even number of bytes/);
    expect(() => rleDecode(new Uint8Array([0, 9]))).toThrow(/zero/);
  });
});
