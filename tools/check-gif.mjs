#!/usr/bin/env node
/**
 * The hero GIF budget (spec R11.11): at most 6 MB and at most 12 seconds.
 * Reads the GIF's own frame delays rather than trusting the encoder.
 *
 *   node tools/check-gif.mjs docs/hero.gif
 */
import { readFileSync, statSync } from 'node:fs';

const path = process.argv[2] ?? 'docs/hero.gif';
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_SECONDS = 12;

const bytes = readFileSync(path);
if (bytes.subarray(0, 3).toString('ascii') !== 'GIF') {
  console.error(`${path} is not a GIF`);
  process.exit(1);
}

let at = 13;
const packed = bytes[10];
if (packed & 0x80) at += 3 * 2 ** ((packed & 0x07) + 1); // global colour table

let frames = 0;
let hundredths = 0;
let pendingDelay = 0;

const skipSubBlocks = () => {
  while (true) {
    const size = bytes[at++];
    if (size === 0 || size === undefined) return;
    at += size;
  }
};

while (at < bytes.length) {
  const block = bytes[at++];
  if (block === 0x3b) break; // trailer
  if (block === 0x21) {
    const label = bytes[at++];
    if (label === 0xf9) {
      // Graphic control extension: size, packed, delay (little-endian), transparent index.
      at++;
      at++;
      pendingDelay = bytes[at] | (bytes[at + 1] << 8);
      at += 3;
      at++; // block terminator
    } else {
      skipSubBlocks();
    }
  } else if (block === 0x2c) {
    at += 8;
    const local = bytes[at++];
    if (local & 0x80) at += 3 * 2 ** ((local & 0x07) + 1);
    at++; // LZW minimum code size
    skipSubBlocks();
    frames++;
    // Browsers treat a zero or very small delay as about ten hundredths.
    hundredths += pendingDelay < 2 ? 10 : pendingDelay;
    pendingDelay = 0;
  } else {
    console.error(`unexpected block 0x${block.toString(16)} at byte ${at - 1}`);
    process.exit(1);
  }
}

const seconds = hundredths / 100;
const size = statSync(path).size;
console.log(
  `${path}: ${frames} frames, ${seconds.toFixed(1)} s, ${(size / 1024 / 1024).toFixed(2)} MB`,
);
const problems = [];
if (size > MAX_BYTES) problems.push(`over ${MAX_BYTES} bytes`);
if (seconds > MAX_SECONDS) problems.push(`over ${MAX_SECONDS} seconds`);
if (problems.length) {
  console.error(`Hero GIF check FAILED: ${problems.join(', ')}`);
  process.exit(1);
}
console.log('Hero GIF check passed.');
