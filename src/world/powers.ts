/**
 * The world-scale powers: what Luciana can do without walking anywhere.
 *
 * Added when the owner replaced eight workers with one companion who can
 * reshape the world. Each one is bounded by a radius, deterministic for a
 * given seed, and undone by the next command rather than by an undo stack.
 *
 * All of them are pure world edits, so the whole set is tested in Node.
 */

import { AIR, blockById } from './blocks';
import { WORLD_X, WORLD_Y, WORLD_Z, World } from './chunks';
import { hashUnit } from './random';
import { plantTree } from './terrain';

/** Blocks that count as the ground itself, which `clear` leaves alone. */
const GROUND = new Set([1, 2, 3, 4]); // crumb, clover, pebble, shell

export interface AreaOptions {
  readonly at: { x: number; y: number; z: number };
  readonly radius: number;
}

export interface PowerResult {
  /** Blocks changed. Zero means the request was legal but did nothing. */
  readonly changed: number;
  /** Set when the power could not do what was asked, for Luciana to voice. */
  readonly problem?: string;
}

/** Visit every column inside the radius, with its distance as a 0..1 falloff. */
function columns(
  at: { x: number; z: number },
  radius: number,
  visit: (x: number, z: number, falloff: number) => void,
): void {
  const r = Math.max(1, Math.min(radius, 16));
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = at.x + dx;
      const z = at.z + dz;
      if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) continue;
      const span = Math.sqrt(dx * dx + dz * dz);
      if (span > r) continue;
      // Smooth, so a raised hill is a dome rather than a cylinder.
      visit(x, z, 1 - span / r);
    }
  }
}

/** The topmost solid block in a column, or -1 for an empty one. */
function surface(world: World, x: number, z: number): number {
  for (let y = WORLD_Y - 1; y >= 0; y--) if (world.get(x, y, z) !== AIR) return y;
  return -1;
}

export function sculpt(
  world: World,
  options: AreaOptions & { shape: 'raise' | 'lower' | 'flatten'; amount: number },
): PowerResult {
  const amount = Math.max(1, Math.min(options.amount, 8));
  let changed = 0;

  if (options.shape === 'flatten') {
    // Level to the average height, so flattening a slope meets it halfway
    // rather than burying or stranding everything on it.
    let total = 0;
    let count = 0;
    columns(options.at, options.radius, (x, z) => {
      total += surface(world, x, z);
      count++;
    });
    if (count === 0) return { changed: 0, problem: 'nothing-there' };
    const target = Math.round(total / count);

    columns(options.at, options.radius, (x, z) => {
      // Take the column down to the target first. A tree or an overhang can
      // leave a gap under what was removed, so the ground is found again
      // afterwards rather than assumed from the original top.
      for (let y = surface(world, x, z); y > target; y--) {
        if (world.set(x, y, z, AIR)) changed++;
      }
      const ground = surface(world, x, z);
      const material = ground >= 0 ? world.get(x, ground, z) : 2;
      for (let y = ground + 1; y <= target; y++) {
        if (world.set(x, y, z, material === AIR ? 2 : material)) changed++;
      }
    });
    return { changed };
  }

  const direction = options.shape === 'raise' ? 1 : -1;
  columns(options.at, options.radius, (x, z, falloff) => {
    const step = Math.round(amount * falloff);
    if (step <= 0) return;
    const top = surface(world, x, z);
    if (top < 0) return;
    const material = world.get(x, top, z);

    if (direction > 0) {
      for (let i = 1; i <= step; i++) {
        if (top + i >= WORLD_Y) break;
        // Carry the surface up, and leave soil rather than turf underneath.
        if (world.set(x, top + i, z, material)) changed++;
        if (i === 1 && material === 2) world.set(x, top, z, 1);
      }
    } else {
      for (let i = 0; i < step; i++) {
        const y = top - i;
        if (y <= 0) break;
        if (world.set(x, y, z, AIR)) changed++;
      }
      const newTop = surface(world, x, z);
      // Put turf back on top so a dug hollow is not bare soil.
      if (newTop > 0 && world.get(x, newTop, z) === 1) world.set(x, newTop, z, 2);
    }
  });

  return { changed };
}

export function paint(world: World, options: AreaOptions & { block: number }): PowerResult {
  if (!blockById(options.block)) return { changed: 0, problem: 'unknown-block' };
  let changed = 0;
  columns(options.at, options.radius, (x, z) => {
    const top = surface(world, x, z);
    if (top < 0) return;
    if (world.set(x, top, z, options.block)) changed++;
  });
  return { changed };
}

export function clearArea(world: World, options: AreaOptions): PowerResult {
  let changed = 0;
  columns(options.at, options.radius, (x, z) => {
    // Take everything down to the ground, which removes trees, crystals and
    // anything the player built, and leaves the landscape itself.
    for (let y = WORLD_Y - 1; y >= 0; y--) {
      const id = world.get(x, y, z);
      if (id === AIR) continue;
      if (GROUND.has(id)) break;
      if (world.set(x, y, z, AIR)) changed++;
    }
  });
  return { changed };
}

export function scatter(
  world: World,
  options: AreaOptions & { block: number; count: number },
  seed: number,
): PowerResult {
  if (!blockById(options.block)) return { changed: 0, problem: 'unknown-block' };

  const spots: [number, number][] = [];
  columns(options.at, options.radius, (x, z) => {
    const top = surface(world, x, z);
    if (top >= 0 && top + 1 < WORLD_Y && world.get(x, top + 1, z) === AIR) spots.push([x, z]);
  });
  if (spots.length === 0) return { changed: 0, problem: 'nowhere-to-put-it' };

  // Deterministic shuffle, so the same command on the same world lands the
  // same way twice.
  spots.sort((a, b) => hashUnit(a[0], 1, a[1], seed) - hashUnit(b[0], 1, b[1], seed));

  let changed = 0;
  for (const spot of spots.slice(0, Math.max(1, Math.min(options.count, 32)))) {
    const top = surface(world, spot[0], spot[1]);
    if (world.set(spot[0], top + 1, spot[1], options.block)) changed++;
  }
  return { changed };
}

export function plant(
  world: World,
  options: AreaOptions & { count: number },
  seed: number,
): PowerResult {
  const spots: [number, number][] = [];
  columns(options.at, options.radius, (x, z) => {
    if (x < 3 || z < 3 || x >= WORLD_X - 3 || z >= WORLD_Z - 3) return;
    const top = surface(world, x, z);
    // Only on open turf or soil, and with headroom for a canopy.
    if (top < 0 || top + 6 >= WORLD_Y) return;
    const ground = world.get(x, top, z);
    if (ground !== 1 && ground !== 2) return;
    if (world.get(x, top + 1, z) !== AIR) return;
    spots.push([x, z]);
  });
  if (spots.length === 0) return { changed: 0, problem: 'nowhere-to-plant' };

  spots.sort((a, b) => hashUnit(a[0], 3, a[1], seed) - hashUnit(b[0], 3, b[1], seed));

  const wanted = Math.max(1, Math.min(options.count, 24));
  const planted: [number, number][] = [];
  for (const spot of spots) {
    if (planted.length >= wanted) break;
    // Keep them apart, or the canopies merge into one green blob.
    if (planted.some(([px, pz]) => Math.abs(px - spot[0]) < 3 && Math.abs(pz - spot[1]) < 3)) {
      continue;
    }
    planted.push(spot);
    plantTree(world, spot[0], spot[1], surface(world, spot[0], spot[1]), seed);
  }

  return planted.length > 0
    ? { changed: planted.length }
    : { changed: 0, problem: 'nowhere-to-plant' };
}
