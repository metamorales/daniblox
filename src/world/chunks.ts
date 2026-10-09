/**
 * Chunk storage (spec: 64x64x32 world in 16x16x32 chunks).
 *
 * Sixteen chunks laid out 4 by 4 on the horizontal plane, each a flat
 * Uint8Array of 8192 block ids. Reads outside the world return air, so the
 * mesher and the pathfinder can sample neighbours without bounds juggling.
 */

import { AIR } from './blocks';

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

/** Local index inside a chunk. Y varies fastest so vertical columns are contiguous. */
export function localIndex(x: number, y: number, z: number): number {
  return (x * CHUNK_Z + z) * CHUNK_Y + y;
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

  constructor(public readonly seed: number) {
    const chunks: Chunk[] = [];
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        chunks.push({ cx, cz, blocks: new Uint8Array(CHUNK_VOLUME), dirty: true });
      }
    }
    this.chunks = chunks;
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

  /** Block id at world coordinates. Outside the world is air. */
  get(x: number, y: number, z: number): number {
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
  }
}
