/**
 * Terrain generation (docs/plan.md section 3.8 rule 5).
 *
 * A small sunny meadow: rolling clover over a rose-clay crumb stack, pebble
 * underneath, shell at the shores, and trees made of real voxels. Everything
 * derives from the seed, so a seed regenerates a world byte for byte, which is
 * what makes saves and share links meaningful.
 */

import { createNoise2D } from 'simplex-noise';
import { World, WORLD_X, WORLD_Y, WORLD_Z } from './chunks';
import { hashUnit, mulberry32 } from './random';

const BLOCK = {
  air: 0,
  crumb: 1,
  clover: 2,
  pebble: 3,
  shell: 4,
  bark: 5,
  sprout: 6,
  tile: 7,
  gem: 8,
} as const;

/** Anything at or below this height is shore, and gets shell instead of clover. */
export const SHORE_LEVEL = 9;

const BASE_HEIGHT = 12;
const HILL_AMPLITUDE = 4.6;
const DETAIL_AMPLITUDE = 1.7;
const HILL_FREQUENCY = 0.035;
const DETAIL_FREQUENCY = 0.09;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 22;

/** Soil depth under the clover before pebble takes over. */
const SOIL_DEPTH = 3;

const TREE_COUNT = 26;
const PLINTH_COUNT = 6;
const SURFACE_GEM_COUNT = 10;
/** Roughly one gem per 700 buried pebble blocks. */
const BURIED_GEM_CHANCE = 0.0014;

export interface TerrainStats {
  readonly heights: Int32Array;
  readonly trees: number;
  readonly plinths: number;
}

function heightField(seed: number): Int32Array {
  const noise = createNoise2D(mulberry32(seed));
  const heights = new Int32Array(WORLD_X * WORLD_Z);
  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const hills = noise(x * HILL_FREQUENCY, z * HILL_FREQUENCY);
      const detail = noise((x + 500) * DETAIL_FREQUENCY, (z + 500) * DETAIL_FREQUENCY);
      const raw = BASE_HEIGHT + hills * HILL_AMPLITUDE + detail * DETAIL_AMPLITUDE;
      heights[z * WORLD_X + x] = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(raw)));
    }
  }
  return heights;
}

/**
 * Pick exactly `count` positions that pass `accept`, deterministically.
 * Exact counts beat a per-cell probability here: the tests assert that every
 * block type occurs, and a dice roll can always come up empty.
 */
function pickSites(
  rng: () => number,
  count: number,
  accept: (x: number, z: number) => boolean,
  minSpacing: number,
): [number, number][] {
  const chosen: [number, number][] = [];
  const maxAttempts = count * 400;
  for (let attempt = 0; attempt < maxAttempts && chosen.length < count; attempt++) {
    const x = Math.floor(rng() * WORLD_X);
    const z = Math.floor(rng() * WORLD_Z);
    if (!accept(x, z)) continue;
    let tooClose = false;
    for (const [px, pz] of chosen) {
      if (Math.abs(px - x) < minSpacing && Math.abs(pz - z) < minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) chosen.push([x, z]);
  }
  return chosen;
}

export function generate(world: World, seed = world.seed): TerrainStats {
  const heights = heightField(seed);
  const heightAt = (x: number, z: number): number => heights[z * WORLD_X + x] ?? MIN_HEIGHT;

  // --- strata ---
  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const h = heightAt(x, z);
      const shore = h <= SHORE_LEVEL;
      // One or two clover blocks, varied per column so the surface is not a
      // uniform skin.
      const turf = shore ? 0 : hashUnit(x, 0, z, seed) < 0.35 ? 2 : 1;

      for (let y = 0; y <= h; y++) {
        let id: number;
        if (shore && y > h - 2) id = BLOCK.shell;
        else if (!shore && y > h - turf) id = BLOCK.clover;
        else if (y > h - turf - SOIL_DEPTH) id = BLOCK.crumb;
        else id = BLOCK.pebble;

        if (
          id === BLOCK.pebble &&
          y < h - turf - SOIL_DEPTH - 1 &&
          hashUnit(x, y, z, seed ^ 0x9e3779b9) < BURIED_GEM_CHANCE
        ) {
          id = BLOCK.gem;
        }
        world.set(x, y, z, id);
      }
      for (let y = h + 1; y < WORLD_Y; y++) world.set(x, y, z, BLOCK.air);
    }
  }

  // --- trees ---
  const rng = mulberry32(seed ^ 0x5f3759df);
  const canPlant = (x: number, z: number): boolean => {
    if (x < 3 || z < 3 || x >= WORLD_X - 3 || z >= WORLD_Z - 3) return false;
    const h = heightAt(x, z);
    if (h <= SHORE_LEVEL + 1 || h > MAX_HEIGHT - 6) return false;
    return world.get(x, h, z) === BLOCK.clover;
  };

  const treeSites = pickSites(rng, TREE_COUNT, canPlant, 4);
  for (const [x, z] of treeSites) {
    const h = heightAt(x, z);
    const trunkTop = h + 2;
    world.set(x, h + 1, z, BLOCK.bark);
    world.set(x, trunkTop, z, BLOCK.bark);

    // A rounded canopy of real voxels. Radius and squash vary per tree, so no
    // two are the same shape.
    const variation = hashUnit(x, 7, z, seed);
    const radius = 1.7 + variation * 0.9;
    const squash = 0.75 + hashUnit(x, 11, z, seed) * 0.45;
    const centreY = trunkTop + 1;

    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const y = centreY + dy;
          if (y >= WORLD_Y) continue;
          const vertical = dy / squash;
          const distance = Math.sqrt(dx * dx + dz * dz + vertical * vertical);
          // A little per-voxel jitter keeps the silhouette from reading as a
          // mathematical sphere.
          const jitter = hashUnit(x + dx, y, z + dz, seed ^ 0x27d4eb2f) * 0.5;
          if (distance > radius + jitter) continue;
          if (world.get(x + dx, y, z + dz) !== BLOCK.air) continue;
          world.set(x + dx, y, z + dz, BLOCK.sprout);
        }
      }
    }
  }

  // --- a few painted plinths, so the building block exists in the world ---
  const flatClover = (x: number, z: number): boolean => {
    if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2) return false;
    const h = heightAt(x, z);
    if (h <= SHORE_LEVEL) return false;
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      if (heightAt(x + (dx ?? 0), z + (dz ?? 0)) !== h) return false;
      if (world.get(x + (dx ?? 0), h + 1, z + (dz ?? 0)) !== BLOCK.air) return false;
    }
    return true;
  };

  const plinthSites = pickSites(rng, PLINTH_COUNT, flatClover, 6);
  for (const [x, z] of plinthSites) {
    const h = heightAt(x, z);
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      world.set(x + (dx ?? 0), h + 1, z + (dz ?? 0), BLOCK.tile);
    }
  }

  // --- surface crystals, the one thing allowed to shout ---
  const openSurface = (x: number, z: number): boolean => {
    if (x < 1 || z < 1 || x >= WORLD_X - 1 || z >= WORLD_Z - 1) return false;
    const h = heightAt(x, z);
    return h > SHORE_LEVEL && world.get(x, h + 1, z) === BLOCK.air;
  };

  for (const [x, z] of pickSites(rng, SURFACE_GEM_COUNT, openSurface, 5)) {
    world.set(x, heightAt(x, z) + 1, z, BLOCK.gem);
  }

  return { heights, trees: treeSites.length, plinths: plinthSites.length };
}
