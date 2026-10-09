/**
 * Greedy mesher with per-vertex ambient occlusion.
 *
 * For each of the three axes the chunk is swept slice by slice. Every slice
 * becomes a mask of visible faces, and runs of identical faces merge into one
 * quad. "Identical" includes the four ambient-occlusion values, because two
 * faces that shade differently cannot share a quad without smearing the
 * shading across both.
 *
 * Ambient occlusion is the usual three-neighbour rule per corner. It is what
 * gives flat printed tiles their depth, so it carries the weight here that a
 * bevelled texture would carry elsewhere.
 */

import { isSolid, layerFor } from './blocks';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, type Chunk, World } from './chunks';

export interface ChunkMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Surface coordinates in block units, so hardware repeat tiles a merged quad. */
  readonly uvs: Float32Array;
  /** Texture array layer per vertex. */
  readonly layers: Float32Array;
  /** Ambient occlusion per vertex, 0 (darkest) to 3 (open). */
  readonly ao: Float32Array;
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

type FaceName = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

const DIMS = [CHUNK_X, CHUNK_Y, CHUNK_Z] as const;
const PAD_X = CHUNK_X + 2;
const PAD_Y = CHUNK_Y + 2;
const PAD_Z = CHUNK_Z + 2;

function padIndex(x: number, y: number, z: number): number {
  return ((x + 1) * PAD_Y + (y + 1)) * PAD_Z + (z + 1);
}

/**
 * Copy the chunk plus a one-block skirt of its neighbours. Ambient occlusion
 * reads diagonally across chunk seams, and one padded read beats thousands of
 * bounds-checked world lookups inside the sweep.
 */
export function padChunk(world: World, chunk: Chunk, out?: Uint8Array): Uint8Array {
  const volume = PAD_X * PAD_Y * PAD_Z;
  const padded = out && out.length === volume ? out : new Uint8Array(volume);
  const baseX = chunk.cx * CHUNK_X;
  const baseZ = chunk.cz * CHUNK_Z;

  for (let x = -1; x <= CHUNK_X; x++) {
    for (let y = -1; y <= CHUNK_Y; y++) {
      for (let z = -1; z <= CHUNK_Z; z++) {
        padded[padIndex(x, y, z)] = world.get(baseX + x, y, baseZ + z);
      }
    }
  }
  return padded;
}

/** Corner order around a quad: (0,0), (1,0), (1,1), (0,1) in the u and v axes. */
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const FACE_FOR_AXIS: Record<number, { positive: FaceName; negative: FaceName }> = {
  0: { positive: 'px', negative: 'nx' },
  1: { positive: 'py', negative: 'ny' },
  2: { positive: 'pz', negative: 'nz' },
};

/**
 * Ambient occlusion for one corner.
 *
 * side1 and side2 are the two neighbours sharing an edge with the corner, and
 * corner is the diagonal one, all of them on the open side of the face. Two
 * solid sides fully enclose the corner, so the diagonal cannot brighten it.
 */
export function cornerAo(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - (Number(side1) + Number(side2) + Number(corner));
}

interface MaskCell {
  id: number;
  layer: number;
  /** True when the face points along the positive axis. */
  positive: boolean;
  ao: [number, number, number, number];
  key: number;
}

export function meshChunk(world: World, chunk: Chunk, scratch?: Uint8Array): ChunkMesh {
  const padded = padChunk(world, chunk, scratch);
  const solidAt = (x: number, y: number, z: number): boolean =>
    isSolid(padded[padIndex(x, y, z)] ?? 0);
  const idAt = (x: number, y: number, z: number): number => padded[padIndex(x, y, z)] ?? 0;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const layers: number[] = [];
  const ao: number[] = [];
  const indices: number[] = [];
  let quadCount = 0;

  const cursor = [0, 0, 0];
  const step = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const sizeD = DIMS[d] ?? 0;
    const sizeU = DIMS[u] ?? 0;
    const sizeV = DIMS[v] ?? 0;
    const faces = FACE_FOR_AXIS[d];
    if (!faces) continue;

    const mask: (MaskCell | null)[] = new Array<MaskCell | null>(sizeU * sizeV).fill(null);

    for (let slice = -1; slice < sizeD; slice++) {
      // Build the mask for the boundary between slice and slice + 1.
      for (let j = 0; j < sizeV; j++) {
        for (let i = 0; i < sizeU; i++) {
          cursor[d] = slice;
          cursor[u] = i;
          cursor[v] = j;
          const ax = cursor[0] ?? 0;
          const ay = cursor[1] ?? 0;
          const az = cursor[2] ?? 0;

          cursor[d] = slice + 1;
          const bx = cursor[0] ?? 0;
          const by = cursor[1] ?? 0;
          const bz = cursor[2] ?? 0;

          const aSolid = solidAt(ax, ay, az);
          const bSolid = solidAt(bx, by, bz);
          if (aSolid === bSolid) {
            mask[j * sizeU + i] = null;
            continue;
          }

          // The face belongs to whichever side is solid, and looks outward.
          const positive = aSolid;

          // Only emit faces owned by a block inside this chunk. Without this
          // every seam would be drawn twice, once by each neighbour, and the
          // solid ground below the world would surface as a floor of its own.
          const owner = positive ? slice : slice + 1;
          if (owner < 0 || owner >= sizeD) {
            mask[j * sizeU + i] = null;
            continue;
          }

          const id = positive ? idAt(ax, ay, az) : idAt(bx, by, bz);
          const layer = layerFor(id, positive ? faces.positive : faces.negative);

          // Ambient occlusion samples the open side of the face.
          const openD = positive ? slice + 1 : slice;
          const corners: [number, number, number, number] = [0, 0, 0, 0];
          for (let c = 0; c < 4; c++) {
            const corner = CORNERS[c];
            if (!corner) continue;
            const du = corner[0] === 1 ? 1 : -1;
            const dv = corner[1] === 1 ? 1 : -1;

            step[d] = openD;
            step[u] = i + du;
            step[v] = j;
            const s1 = solidAt(step[0] ?? 0, step[1] ?? 0, step[2] ?? 0);

            step[u] = i;
            step[v] = j + dv;
            const s2 = solidAt(step[0] ?? 0, step[1] ?? 0, step[2] ?? 0);

            step[u] = i + du;
            step[v] = j + dv;
            const sc = solidAt(step[0] ?? 0, step[1] ?? 0, step[2] ?? 0);

            corners[c] = cornerAo(s1, s2, sc);
          }

          mask[j * sizeU + i] = {
            id,
            layer,
            positive,
            ao: corners,
            // Everything a merge must agree on, packed into one comparable number.
            key:
              (layer << 10) |
              ((positive ? 1 : 0) << 9) |
              (corners[0] << 6) |
              (corners[1] << 4) |
              (corners[2] << 2) |
              corners[3],
          };
        }
      }

      // Greedily merge equal mask cells into rectangles.
      for (let j = 0; j < sizeV; j++) {
        for (let i = 0; i < sizeU;) {
          const cell = mask[j * sizeU + i];
          if (!cell) {
            i++;
            continue;
          }

          let width = 1;
          while (i + width < sizeU && mask[j * sizeU + i + width]?.key === cell.key) width++;

          let height = 1;
          grow: while (j + height < sizeV) {
            for (let k = 0; k < width; k++) {
              if (mask[(j + height) * sizeU + i + k]?.key !== cell.key) break grow;
            }
            height++;
          }

          emitQuad(cell, d, u, v, slice, i, j, width, height);

          for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) mask[(j + h) * sizeU + i + w] = null;
          }
          i += width;
        }
      }
    }
  }

  function emitQuad(
    cell: MaskCell,
    d: number,
    u: number,
    v: number,
    slice: number,
    i: number,
    j: number,
    width: number,
    height: number,
  ): void {
    const base = quadCount * 4;
    const origin = [0, 0, 0];
    origin[d] = slice + 1;
    origin[u] = i;
    origin[v] = j;

    const normal = [0, 0, 0];
    normal[d] = cell.positive ? 1 : -1;

    for (let c = 0; c < 4; c++) {
      const corner = CORNERS[c];
      if (!corner) continue;
      const point = [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0];
      point[u] = (origin[u] ?? 0) + corner[0] * width;
      point[v] = (origin[v] ?? 0) + corner[1] * height;

      positions.push(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
      normals.push(normal[0] ?? 0, normal[1] ?? 0, normal[2] ?? 0);
      uvs.push(corner[0] * width, corner[1] * height);
      layers.push(cell.layer);
      ao.push(cell.ao[c] ?? 3);
    }

    // Split along whichever diagonal keeps the shading from creasing the wrong
    // way: without this an occluded corner smears across the whole quad.
    const flip = (cell.ao[0] ?? 3) + (cell.ao[2] ?? 3) > (cell.ao[1] ?? 3) + (cell.ao[3] ?? 3);
    const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    // A face looking down the negative axis is seen from the other side, so its
    // winding reverses or it renders inside out under backface culling.
    const wound = cell.positive ? order : [...order].reverse();
    for (const offset of wound) indices.push(base + offset);

    quadCount++;
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    layers: Float32Array.from(layers),
    ao: Float32Array.from(ao),
    indices: Uint32Array.from(indices),
    quadCount,
  };
}
