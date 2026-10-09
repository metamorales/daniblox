/**
 * Chunk storage (spec: 64x64x32 world in 16x16x32 chunks).
 *
 * Sixteen chunks laid out 4 by 4 on the horizontal plane, each a flat
 * Uint8Array of 8192 block ids. Reads outside the world return air, so the
 * mesher and the pathfinder can sample neighbours without bounds juggling.
 */

import { AIR } from './blocks';

/** Stand-in for the solid ground under the world. Never rendered, never written. */
const BEDROCK = 3;

export const CHUNK_X = 16;
export const CHUNK_Y = 32;
export const CHUNK_Z = 16;
export const CHUNK_VOLUME = CHUNK_X * CHUNK_Y * CHUNK_Z;

export const CHUNKS_X = 4;
export const CHUNKS_Z = 4;
export const CHUNK_COUNT = CHUNKS_X * CHUNKS_Z;

export const WORLD_X = CHUNK_X * CHUNKS_X;
export const WORLD_Y = CHUNK_Y;
export const WORLD_Z = CHUNK_Z * CHUNKS_Z;

/**
 * Local index inside a chunk, ordered as horizontal slabs stacked in y.
 *
 * A slab of terrain is mostly one block type, so this ordering runs far longer
 * than a column-major one and makes the run-length encoding in M7 roughly
 * three times smaller.
 */
export function localIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_Z + z) * CHUNK_X + x;
}

export interface Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
  /** Set when a block changes; the mesher drains these one per frame. */
  dirty: boolean;
}

export class World {
  readonly chunks: readonly Chunk[];
  /** Bumped on every change, so a saver can tell at a glance whether to write. */
  revision = 0;
  private seedValue: number;

  constructor(seed: number) {
    this.seedValue = seed >>> 0;
    const chunks: Chunk[] = [];
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        chunks.push({ cx, cz, blocks: new Uint8Array(CHUNK_VOLUME), dirty: true });
      }
    }
    this.chunks = chunks;
  }

  get seed(): number {
    return this.seedValue;
  }

  /** A new seed for a reset; the caller regenerates the terrain after. */
  reseed(seed: number): void {
    this.seedValue = seed >>> 0;
    this.revision++;
  }

  static chunkIndex(cx: number, cz: number): number {
    return cz * CHUNKS_X + cx;
  }

  chunkAt(cx: number, cz: number): Chunk | undefined {
    if (cx < 0 || cz < 0 || cx >= CHUNKS_X || cz >= CHUNKS_Z) return undefined;
    return this.chunks[World.chunkIndex(cx, cz)];
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < WORLD_X && y < WORLD_Y && z < WORLD_Z;
  }

  /**
   * Block id at world coordinates.
   *
   * Beyond the sides and above the ceiling is air, so the world reads as a
   * diorama with a visible soil cross-section. Below the floor is solid: that
   * hides every downward face, which nothing can ever see, and lets ambient
   * occlusion ground the bottom row instead of leaving it floating.
   */
  get(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (!this.inBounds(x, y, z)) return AIR;
    const chunk = this.chunks[World.chunkIndex(x >> 4, z >> 4)];
    if (!chunk) return AIR;
    return chunk.blocks[localIndex(x & 15, y, z & 15)] ?? AIR;
  }

  /**
   * Write a block and mark the owning chunk dirty, plus any neighbour chunk
   * whose mesh touches this column, since ambient occlusion reads across the
   * seam.
   */
  set(x: number, y: number, z: number, id: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunks[World.chunkIndex(cx, cz)];
    if (!chunk) return false;

    const index = localIndex(x & 15, y, z & 15);
    if (chunk.blocks[index] === id) return false;
    chunk.blocks[index] = id;
    chunk.dirty = true;
    this.revision++;

    const lx = x & 15;
    const lz = z & 15;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_Z - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  private markDirty(cx: number, cz: number): void {
    const neighbour = this.chunkAt(cx, cz);
    if (neighbour) neighbour.dirty = true;
  }

  /** Height of the topmost solid block in a column, or -1 if the column is empty. */
  surfaceHeight(x: number, z: number): number {
    for (let y = WORLD_Y - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== AIR) return y;
    }
    return -1;
  }

  /** Flat copy of every chunk in index order, for saving and for hashing. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(CHUNK_COUNT * CHUNK_VOLUME);
    this.chunks.forEach((chunk, i) => out.set(chunk.blocks, i * CHUNK_VOLUME));
    return out;
  }

  loadBytes(bytes: Uint8Array): void {
    if (bytes.length !== CHUNK_COUNT * CHUNK_VOLUME) {
      throw new Error(
        `World data must be ${String(CHUNK_COUNT * CHUNK_VOLUME)} bytes, got ${String(bytes.length)}`,
      );
    }
    this.chunks.forEach((chunk, i) => {
      chunk.blocks.set(bytes.subarray(i * CHUNK_VOLUME, (i + 1) * CHUNK_VOLUME));
      chunk.dirty = true;
    });
    this.revision++;
  }
}
