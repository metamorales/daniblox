/**
 * Share links (spec R8).
 *
 * `#s=<seed>` recreates the terrain; `&w=<edits>` carries what changed
 * since, as a run-length difference against the generated world, and `&h=`
 * is a checksum of those edits so a mangled link is noticed rather than
 * loaded. Edits ride along only while the whole hash stays under 2,000
 * characters; past that the link is seed only and the caller says so.
 *
 * Nothing here can ever see the API key: the inputs are a seed and two
 * copies of the world.
 */

import { hashBytes } from '../world/random';
import { rleDecode, rleEncode } from '../world/rle';
import { WORLD_BYTES } from './persistence';

export const MAX_HASH_LENGTH = 2000;

export interface ShareHash {
  readonly hash: string;
  /** False when the edits did not fit and the link carries the seed alone. */
  readonly complete: boolean;
}

export type ShareOutcome =
  | { readonly ok: true; readonly seed: number; readonly edits: Uint8Array | null }
  | { readonly ok: false; readonly reason: 'none' | 'corrupt' };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Cells that differ, as the new id plus one; zero means unchanged. */
export function diffWorlds(base: Uint8Array, current: Uint8Array): Uint8Array {
  const out = new Uint8Array(base.length);
  let changed = 0;
  for (let i = 0; i < base.length; i++) {
    if (base[i] !== current[i]) {
      out[i] = (current[i] ?? 0) + 1;
      changed++;
    }
  }
  return changed === 0 ? new Uint8Array(0) : out;
}

export function applyEdits(base: Uint8Array, edits: Uint8Array): Uint8Array {
  const out = new Uint8Array(base);
  for (let i = 0; i < edits.length && i < out.length; i++) {
    const value = edits[i] ?? 0;
    if (value > 0) out[i] = value - 1;
  }
  return out;
}

export function encodeShare(seed: number, base: Uint8Array, current: Uint8Array): ShareHash {
  const seedOnly = `#s=${String(seed >>> 0)}`;
  const diff = diffWorlds(base, current);
  if (diff.length === 0) return { hash: seedOnly, complete: true };

  const packed = toBase64Url(rleEncode(diff));
  const full = `${seedOnly}&w=${packed}&h=${hashBytes(diff)}`;
  if (full.length > MAX_HASH_LENGTH) return { hash: seedOnly, complete: false };
  return { hash: full, complete: true };
}

export function decodeShare(hash: string): ShareOutcome {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!text) return { ok: false, reason: 'none' };
  const params = new URLSearchParams(text);
  const seedText = params.get('s');
  if (seedText === null) return { ok: false, reason: 'none' };
  if (!/^\d{1,10}$/.test(seedText)) return { ok: false, reason: 'corrupt' };
  const seed = Number.parseInt(seedText, 10);
  if (seed > 0xffffffff) return { ok: false, reason: 'corrupt' };

  const packed = params.get('w');
  if (packed === null) return { ok: true, seed, edits: null };

  try {
    const edits = rleDecode(fromBase64Url(packed));
    if (edits.length !== WORLD_BYTES) return { ok: false, reason: 'corrupt' };
    if (params.get('h') !== hashBytes(edits)) return { ok: false, reason: 'corrupt' };
    return { ok: true, seed, edits };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
