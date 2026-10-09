/**
 * Layered source for the Daniblox texture atlas.
 *
 * This is the art, not a build artifact. Each tile is 16 by 16 and is written
 * as a base fill plus named layers of individual pixels, which keeps the source
 * diffable in git and editable without an image editor. `tools/atlas.mjs`
 * composites it into public/atlas/atlas.png.
 *
 * House rules, from docs/plan.md section 3.8 rule 1:
 *  - a uniform one-pixel pale rim on all four edges, never a dark edge, so
 *    tiles read as cut card and merged faces still show block boundaries
 *  - at most six colours per tile
 *  - no pattern element touches two opposite edges, so repeats never seam
 *  - no rings, no course lines, nothing that reads as masonry or soil
 */

export const CREAM = '#fdf3e2';
export const INK = '#332a4a';
export const TILE_SIZE = 16;

/** Pale rim: base mixed this far toward cream. */
export const RIM_MIX = 0.35;
/** Interior highlight and shade, kept gentle so tiles stay flat and printed. */
export const LIGHT_MIX = 0.3;
export const DARK_MIX = 0.2;

/**
 * Tiles in atlas layer order. The layer index must match LAYER in
 * src/world/blocks.ts.
 *
 * Mark tones: 'light' and 'dark' are derived from the tile's own base, while a
 * hex string is literal. Coordinates are [x, y] with the origin top-left.
 */
export const TILES = [
  {
    layer: 0,
    name: 'crumb',
    base: '#e6a0a4',
    note: 'Rose-clay soil with a riso speckle. Never brown, even shaded.',
    marks: [
      {
        tone: 'dark',
        px: [
          [4, 5],
          [5, 5],
          [9, 11],
          [12, 4],
          [6, 13],
          [11, 13],
          [2, 8],
        ],
      },
      {
        tone: 'light',
        px: [
          [6, 8],
          [7, 8],
          [11, 7],
          [3, 11],
          [13, 10],
          [2, 4],
          [9, 2],
        ],
      },
    ],
  },
  {
    layer: 1,
    name: 'clover-top',
    base: '#86cf6c',
    note: 'Grass from above: short blades and four little white flowers.',
    marks: [
      {
        tone: 'dark',
        px: [
          [3, 9],
          [3, 10],
          [12, 4],
          [12, 5],
          [8, 12],
          [8, 13],
          [6, 6],
          [6, 7],
          [13, 11],
        ],
      },
      {
        tone: 'light',
        px: [
          [10, 10],
          [4, 3],
          [13, 8],
          [5, 5],
          [11, 8],
          [7, 13],
          [2, 12],
        ],
      },
      {
        tone: CREAM,
        px: [
          [5, 4],
          [11, 7],
          [7, 12],
          [2, 11],
        ],
      },
    ],
  },
  {
    layer: 2,
    name: 'clover-side',
    base: '#86cf6c',
    note: 'The same green carried down the sides, so no cube ever caps a brown one.',
    marks: [
      {
        tone: 'dark',
        px: [
          [4, 6],
          [4, 7],
          [11, 10],
          [11, 11],
          [8, 3],
          [2, 12],
        ],
      },
      {
        tone: 'light',
        px: [
          [8, 4],
          [3, 12],
          [13, 7],
          [6, 10],
          [10, 2],
        ],
      },
    ],
  },
  {
    layer: 3,
    name: 'pebble',
    base: '#c3c7d6',
    note: 'Lavender-grey card with two rounded pebbles. No cobbles, no cells.',
    marks: [
      {
        tone: 'light',
        px: [
          [4, 5],
          [5, 5],
          [4, 6],
          [5, 6],
          [6, 6],
          [5, 7],
          [10, 9],
          [11, 9],
          [10, 10],
          [11, 10],
          [12, 10],
          [11, 11],
        ],
      },
      {
        tone: 'dark',
        px: [
          [6, 7],
          [3, 6],
          [12, 11],
          [9, 10],
          [12, 4],
          [3, 12],
        ],
      },
    ],
  },
  {
    layer: 4,
    name: 'shell',
    base: '#f6e4c3',
    note: 'Pale shore with scattered grains and one tiny shell hook.',
    marks: [
      {
        tone: 'dark',
        px: [
          [3, 10],
          [12, 5],
          [7, 3],
          [5, 13],
          [13, 8],
          [9, 11],
          [10, 11],
          [10, 12],
        ],
      },
      {
        tone: 'light',
        px: [
          [5, 7],
          [6, 7],
          [12, 9],
          [9, 4],
          [3, 5],
          [8, 8],
        ],
      },
    ],
  },
  {
    layer: 5,
    name: 'bark-side',
    base: '#9c6243',
    note: 'Trunk grain as soft vertical strokes and one knot. No rings, no hoops.',
    marks: [
      {
        tone: 'dark',
        px: [
          [4, 2],
          [4, 3],
          [4, 4],
          [4, 5],
          [4, 6],
          [4, 7],
          [4, 8],
          [4, 9],
          [4, 10],
          [4, 11],
          [10, 4],
          [10, 5],
          [10, 6],
          [10, 7],
          [10, 8],
          [10, 9],
          [10, 10],
          [10, 11],
          [10, 12],
          [10, 13],
          [7, 12],
          [8, 12],
        ],
      },
      {
        tone: 'light',
        px: [
          [7, 3],
          [7, 4],
          [7, 5],
          [7, 6],
          [7, 7],
          [7, 8],
          [7, 9],
          [7, 10],
          [12, 3],
          [2, 9],
        ],
      },
    ],
  },
  {
    layer: 6,
    name: 'bark-end',
    base: '#c08a68',
    note: 'The cut end: a lighter face with one open swirl, never nested rings.',
    marks: [
      {
        tone: 'dark',
        px: [
          [6, 6],
          [7, 5],
          [8, 5],
          [9, 6],
          [10, 7],
          [10, 8],
          [9, 9],
        ],
      },
      {
        tone: 'light',
        px: [
          [8, 7],
          [7, 7],
          [8, 8],
          [4, 4],
          [12, 12],
          [3, 11],
        ],
      },
    ],
  },
  {
    layer: 7,
    name: 'sprout',
    base: '#3fae7f',
    note: 'Teal leaf clusters with two rose berries.',
    marks: [
      {
        tone: 'light',
        px: [
          [4, 5],
          [5, 5],
          [6, 5],
          [4, 6],
          [5, 6],
          [10, 9],
          [11, 9],
          [12, 9],
          [10, 10],
          [11, 10],
        ],
      },
      {
        tone: 'dark',
        px: [
          [7, 3],
          [3, 11],
          [12, 6],
          [6, 12],
          [13, 13],
          [2, 3],
        ],
      },
      {
        tone: '#e6a0a4',
        px: [
          [8, 12],
          [12, 13],
        ],
      },
    ],
  },
  {
    layer: 8,
    name: 'tile',
    base: '#4f8fd8',
    note: 'Painted panel: a sheen along the top and one corner notch.',
    marks: [
      {
        tone: 'light',
        px: [
          [3, 2],
          [4, 2],
          [5, 2],
          [6, 2],
          [7, 2],
          [8, 2],
          [9, 2],
          [10, 2],
          [11, 2],
          [12, 2],
          [3, 3],
          [4, 3],
          [5, 3],
          [6, 3],
        ],
      },
      {
        tone: 'dark',
        px: [
          [11, 11],
          [12, 11],
          [11, 12],
          [12, 12],
          [3, 13],
        ],
      },
    ],
  },
  {
    layer: 9,
    name: 'gem',
    base: '#ff5fa2',
    note: 'Crystal facet with a four-point sparkle. Unlit, so it glows after dark.',
    marks: [
      {
        tone: 'light',
        px: [
          [4, 4],
          [5, 4],
          [6, 4],
          [7, 4],
          [4, 5],
          [5, 5],
          [6, 5],
          [4, 6],
          [5, 6],
          [4, 7],
        ],
      },
      {
        tone: 'dark',
        px: [
          [10, 10],
          [11, 10],
          [12, 10],
          [10, 11],
          [11, 11],
          [12, 11],
          [11, 12],
          [12, 12],
        ],
      },
      {
        tone: CREAM,
        px: [
          [11, 3],
          [11, 5],
          [10, 4],
          [12, 4],
          [11, 4],
        ],
      },
    ],
  },
];
