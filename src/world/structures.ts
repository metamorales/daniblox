/**
 * Blueprints for the things a kit can build (owner's changes, plan M9).
 *
 * A blueprint is a list of cells with the block that goes in each, relative
 * to the ground at the site, ordered bottom up so a half-built thing never
 * floats. Pure: it reads the world only to find the ground and the edges, so
 * the queue can count materials before she lifts a paw.
 */

import { blockByName } from './blocks';
import { WORLD_Y, World } from './chunks';

export const STRUCTURES = ['tower', 'house', 'litterbox'] as const;
export type StructureKind = (typeof STRUCTURES)[number];

export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BlueprintCell extends Cell {
  readonly block: number;
}

export interface Blueprint {
  readonly kind: StructureKind;
  /** What goes where, bottom up. */
  readonly cells: readonly BlueprintCell[];
  /** Block id → how many of it the whole thing needs. */
  readonly bill: ReadonlyMap<number, number>;
}

/** A plain word for each, for her lines and the parser. */
export const STRUCTURE_LABELS: Record<StructureKind, string> = {
  tower: 'cat tower',
  house: 'little house',
  litterbox: 'litter box',
};

interface Part {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly block: 'bark' | 'shell' | 'gem';
}

function ring(
  dy: number,
  block: Part['block'],
  skip: readonly (readonly [number, number])[] = [],
): Part[] {
  const parts: Part[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      if (skip.some(([sx, sz]) => sx === dx && sz === dz)) continue;
      parts.push({ dx, dy, dz, block });
    }
  }
  return parts;
}

function slab(dy: number, block: Part['block']): Part[] {
  const parts: Part[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) parts.push({ dx, dy, dz, block });
  return parts;
}

/** The door of the house faces the near side, toward smaller z. */
const DOOR: readonly [number, number] = [0, -1];

const SHAPES: Record<StructureKind, readonly Part[]> = {
  // A trunk three high with a perch each side on the way up, a platform on
  // top and a gem to sparkle from the summit: fourteen bark, one gem.
  tower: [
    { dx: 0, dy: 0, dz: 0, block: 'bark' },
    { dx: 0, dy: 1, dz: 0, block: 'bark' },
    { dx: 1, dy: 1, dz: 0, block: 'bark' },
    { dx: 0, dy: 2, dz: 0, block: 'bark' },
    { dx: -1, dy: 2, dz: 0, block: 'bark' },
    ...slab(3, 'bark'),
    { dx: 0, dy: 4, dz: 0, block: 'gem' },
  ],
  // Walls two high around a one-cell room, with a doorway, under a flat roof:
  // twenty-three bark.
  house: [...ring(0, 'bark', [DOOR]), ...ring(1, 'bark', [DOOR]), ...slab(2, 'bark')],
  // A rim of bark with sand in the middle: eight bark, one shell.
  litterbox: [...ring(0, 'bark'), { dx: 0, dy: 0, dz: 0, block: 'shell' }],
};

/**
 * Lay a structure out at a site. The structure stands on the ground of the
 * site's column; the cell's own height is ignored, so "here" always means
 * the ground under the ring. Cells outside the world are left out.
 */
export function blueprint(kind: StructureKind, at: Cell, world: World): Blueprint {
  const ground = world.surfaceHeight(at.x, at.z);
  const base = ground + 1;
  const cells: BlueprintCell[] = [];
  const bill = new Map<number, number>();

  const ordered = [...SHAPES[kind]].sort(
    (a, b) => a.dy - b.dy || Math.abs(a.dx) + Math.abs(a.dz) - (Math.abs(b.dx) + Math.abs(b.dz)),
  );
  for (const part of ordered) {
    const cell = { x: at.x + part.dx, y: base + part.dy, z: at.z + part.dz };
    if (!world.inBounds(cell.x, cell.y, cell.z) || cell.y >= WORLD_Y) continue;
    const block = blockByName(part.block)?.id;
    if (block === undefined) continue;
    cells.push({ ...cell, block });
    bill.set(block, (bill.get(block) ?? 0) + 1);
  }
  return { kind, cells, bill };
}
