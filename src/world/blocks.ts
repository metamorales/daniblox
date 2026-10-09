/**
 * The block registry (docs/plan.md section 3.4).
 *
 * Eight block types plus air, every name a short word for something you would
 * find on a sunny walk: crumb, clover, pebble, shell, bark, sprout, tile, gem.
 * Each is easy to type, and plain synonyms mean nobody has to learn the
 * vocabulary before giving an order.
 */

export const AIR = 0;

export const BLOCK_IDS = [
  AIR,
  1, // crumb
  2, // clover
  3, // pebble
  4, // shell
  5, // bark
  6, // sprout
  7, // tile
  8, // gem
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

/** Atlas array-texture layers. Most blocks use one tile on every face. */
export const LAYER = {
  crumb: 0,
  cloverTop: 1,
  cloverSide: 2,
  pebble: 3,
  shell: 4,
  barkSide: 5,
  barkEnd: 6,
  sprout: 7,
  tile: 8,
  gem: 9,
} as const;

export const LAYER_COUNT = 10;

export interface BlockDefinition {
  readonly id: Exclude<BlockId, typeof AIR>;
  /** Stable lowercase identifier used in saves, commands and the atlas. */
  readonly name: string;
  /** What a kit calls it out loud. */
  readonly label: string;
  /** Extra words the command parser accepts for this block (M3). */
  readonly synonyms: readonly string[];
  /** Solid blocks occlude faces, block movement and support a kit's weight. */
  readonly solid: boolean;
  /** Unlit blocks skip lighting, ambient occlusion and the night tint. */
  readonly unlit: boolean;
  /** Atlas layer per face group. */
  readonly tiles: { readonly top: number; readonly side: number; readonly bottom: number };
  /** Base colour, kept in step with the palette in src/ui/tokens.css. */
  readonly colour: string;
}

function uniform(layer: number) {
  return { top: layer, side: layer, bottom: layer } as const;
}

export const BLOCKS: readonly BlockDefinition[] = [
  {
    id: 1,
    name: 'crumb',
    label: 'crumb',
    synonyms: ['ground', 'earth', 'soil'],
    solid: true,
    unlit: false,
    tiles: uniform(LAYER.crumb),
    colour: '#e6a0a4',
  },
  {
    id: 2,
    name: 'clover',
    label: 'clover',
    synonyms: ['grass', 'turf', 'lawn'],
    solid: true,
    unlit: false,
    // Green on every face. The sides never expose a brown block beneath, which
    // is what keeps the terrain from reading like the genre-defining block game.
    tiles: { top: LAYER.cloverTop, side: LAYER.cloverSide, bottom: LAYER.cloverSide },
    colour: '#86cf6c',
  },
  {
    id: 3,
    name: 'pebble',
    label: 'pebble',
    synonyms: ['stone', 'rock'],
    solid: true,
    unlit: false,
    tiles: uniform(LAYER.pebble),
    colour: '#c3c7d6',
  },
  {
    id: 4,
    name: 'shell',
    label: 'shell',
    synonyms: ['sand', 'shore'],
    solid: true,
    unlit: false,
    tiles: uniform(LAYER.shell),
    colour: '#f6e4c3',
  },
  {
    id: 5,
    name: 'bark',
    label: 'bark',
    synonyms: ['log', 'wood', 'trunk'],
    solid: true,
    unlit: false,
    tiles: { top: LAYER.barkEnd, side: LAYER.barkSide, bottom: LAYER.barkEnd },
    colour: '#9c6243',
  },
  {
    id: 6,
    name: 'sprout',
    label: 'sprout',
    synonyms: ['leaves', 'leaf', 'canopy'],
    solid: true,
    unlit: false,
    tiles: uniform(LAYER.sprout),
    colour: '#3fae7f',
  },
  {
    id: 7,
    name: 'tile',
    label: 'tile',
    synonyms: ['brick', 'block', 'panel'],
    solid: true,
    unlit: false,
    tiles: uniform(LAYER.tile),
    colour: '#4f8fd8',
  },
  {
    id: 8,
    name: 'gem',
    label: 'gem',
    synonyms: ['crystal', 'marker', 'sparkle'],
    solid: true,
    // The one block that stays bright after dark, by design.
    unlit: true,
    tiles: uniform(LAYER.gem),
    colour: '#ff5fa2',
  },
];

const BY_ID = new Map<number, BlockDefinition>(BLOCKS.map((b) => [b.id, b]));
const BY_NAME = new Map<string, BlockDefinition>();
for (const block of BLOCKS) {
  BY_NAME.set(block.name, block);
  for (const synonym of block.synonyms) BY_NAME.set(synonym, block);
}

export function blockById(id: number): BlockDefinition | undefined {
  return BY_ID.get(id);
}

/** Resolve a registry name or synonym. Case and surrounding space are ignored. */
export function blockByName(name: string): BlockDefinition | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export function isSolid(id: number): boolean {
  return id !== AIR && BY_ID.has(id);
}

export function isUnlit(id: number): boolean {
  return BY_ID.get(id)?.unlit ?? false;
}

/** Atlas layer for a face, where ny is the downward face and py the upward one. */
export function layerFor(id: number, face: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'): number {
  const block = BY_ID.get(id);
  if (!block) return 0;
  if (face === 'py') return block.tiles.top;
  if (face === 'ny') return block.tiles.bottom;
  return block.tiles.side;
}
