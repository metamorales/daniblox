#!/usr/bin/env node
/**
 * Composite the layered tile source into public/atlas/atlas.png.
 *
 * The atlas is a vertical strip, 16 px wide by (16 * layers) tall, so the
 * runtime can slice layer N out of rows N*16..N*16+15 and hand it straight to
 * a WebGL2 array texture.
 *
 * PNG is written by hand rather than with an image library: the dependency
 * budget in the spec does not allow one, and an 8-bit RGBA PNG is a header, a
 * zlib stream of filter-zero scanlines, and three CRCs.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREAM,
  DARK_MIX,
  INK,
  LIGHT_MIX,
  RIM_MIX,
  TILES,
  TILE_SIZE,
} from '../public/atlas/src/tiles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'atlas', 'atlas.png');

// --- colour helpers -------------------------------------------------------

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a, b, t) {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return [
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  ];
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbDistance(a, b) {
  const [ar, ag, ab] = a;
  const [br, bg, bb] = b;
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function toHsl([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l * 100];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    (max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4) * 60;
  return [(h + 360) % 360, s * 100, l * 100];
}

// --- PNG writer -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with filter type 0 (none). Pixel art compresses
  // fine without per-line prediction.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- composite ------------------------------------------------------------

function renderTile(tile) {
  const base = parseHex(tile.base);
  const tones = {
    base,
    light: mix(tile.base, CREAM, LIGHT_MIX),
    dark: mix(tile.base, INK, DARK_MIX),
    rim: mix(tile.base, CREAM, RIM_MIX),
  };

  const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const put = (x, y, [r, g, b]) => {
    const i = (y * TILE_SIZE + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  };

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const onEdge = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
      put(x, y, onEdge ? tones.rim : tones.base);
    }
  }

  for (const mark of tile.marks) {
    const colour =
      typeof mark.tone === 'string' && mark.tone.startsWith('#')
        ? parseHex(mark.tone)
        : tones[mark.tone];
    if (!colour) throw new Error(`${tile.name}: unknown tone "${mark.tone}"`);
    for (const [x, y] of mark.px) {
      if (x < 1 || y < 1 || x > TILE_SIZE - 2 || y > TILE_SIZE - 2) {
        throw new Error(`${tile.name}: mark at ${x},${y} runs into the rim`);
      }
      put(x, y, colour);
    }
  }

  return { pixels, tones };
}

// --- the token lint from docs/plan.md section 3.8 rule 7 ------------------

function lint(rendered) {
  const problems = [];

  for (const { tile, pixels, tones } of rendered) {
    const at = (x, y) => {
      const i = (y * TILE_SIZE + x) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    };
    const baseLuma = tones.base[0] * 0.299 + tones.base[1] * 0.587 + tones.base[2] * 0.114;

    // No dark pixel on the bottom or right edge: that is how a bevel creeps in.
    for (let i = 0; i < TILE_SIZE; i++) {
      for (const [x, y, where] of [
        [i, TILE_SIZE - 1, 'bottom'],
        [TILE_SIZE - 1, i, 'right'],
      ]) {
        const [r, g, b] = at(x, y);
        if (r * 0.299 + g * 0.587 + b * 0.114 < baseLuma) {
          problems.push(`${tile.name}: dark pixel on the ${where} edge at ${x},${y}`);
        }
      }
    }

    // The rim must be present and uniform on all four edges.
    const rimHex = toHex(tones.rim);
    for (let i = 0; i < TILE_SIZE; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, TILE_SIZE - 1],
        [0, i],
        [TILE_SIZE - 1, i],
      ]) {
        if (toHex(at(x, y)) !== rimHex) problems.push(`${tile.name}: rim broken at ${x},${y}`);
      }
    }

    // At most six distinct colours, so tiles stay flat and printed.
    const used = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      used.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }
    if (used.size > 6) problems.push(`${tile.name}: ${used.size} colours, at most 6 allowed`);

    // Nothing may read as soil, at full light or in shadow.
    const shaded = tones.base.map((v) => Math.round(v * 0.6));
    for (const [label, colour] of [
      ['base', tones.base],
      ['shaded', shaded],
    ]) {
      const [h, s, l] = toHsl(colour);
      const inBrownBand = h >= 10 && h <= 40 && s > 20 && l >= 20 && l <= 50;
      const trunk = tile.name.startsWith('bark');
      if (inBrownBand && !trunk) {
        problems.push(
          `${tile.name}: ${label} colour ${toHex(colour)} is in the brown band (h${Math.round(h)} s${Math.round(s)} l${Math.round(l)})`,
        );
      }
    }
  }

  // Blocks must stay apart at a glance, including on a small screen.
  for (let i = 0; i < rendered.length; i++) {
    for (let j = i + 1; j < rendered.length; j++) {
      const a = rendered[i];
      const b = rendered[j];
      // Two faces of the same block are allowed to be close.
      const familyA = a.tile.name.split('-')[0];
      const familyB = b.tile.name.split('-')[0];
      if (familyA === familyB) continue;
      const distance = rgbDistance(a.tones.base, b.tones.base);
      if (distance < 60) {
        problems.push(
          `${a.tile.name} and ${b.tile.name} are only ${distance.toFixed(1)} apart in RGB, minimum is 60`,
        );
      }
    }
  }

  return problems;
}

// --- main -----------------------------------------------------------------

const ordered = [...TILES].sort((a, b) => a.layer - b.layer);
ordered.forEach((tile, index) => {
  if (tile.layer !== index)
    throw new Error(
      `Tile layers must be 0..n with no gaps; got ${tile.layer} at position ${index}`,
    );
});

const rendered = ordered.map((tile) => ({ tile, ...renderTile(tile) }));

const problems = lint(rendered);
if (problems.length) {
  console.error('Atlas token lint FAILED:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

const height = TILE_SIZE * rendered.length;
const strip = new Uint8Array(TILE_SIZE * height * 4);
rendered.forEach(({ pixels }, layer) => strip.set(pixels, layer * TILE_SIZE * TILE_SIZE * 4));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePng(TILE_SIZE, height, strip));

console.log(`Atlas written: ${TILE_SIZE}x${height}, ${rendered.length} layers`);
for (const { tile, tones } of rendered) {
  console.log(
    `  layer ${String(tile.layer).padStart(2)}  ${tile.name.padEnd(12)} ${toHex(tones.base)}  rim ${toHex(tones.rim)}`,
  );
}
console.log('Token lint passed.');
