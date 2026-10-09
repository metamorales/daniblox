#!/usr/bin/env node
/** Gzipped JS+CSS budget from spec R6: 600 KB, excluding the atlas and fonts. */
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DIST = 'dist';
const BUDGET = 600 * 1024;
const COUNTED = new Set(['.js', '.css']);
const EXCLUDED_DIRS = ['atlas', 'fonts'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`Bundle size check FAILED: ${DIST}/ not found. Run "npm run build" first.`);
  process.exit(1);
}

const counted = files
  .map((f) => relative(DIST, f))
  .filter((rel) => COUNTED.has(extname(rel)))
  .filter((rel) => !EXCLUDED_DIRS.includes(rel.split('/')[0]))
  .map((rel) => ({ rel, gz: gzipSync(readFileSync(join(DIST, rel)), { level: 9 }).length }))
  .sort((a, b) => b.gz - a.gz);

const total = counted.reduce((n, f) => n + f.gz, 0);
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';

console.log('Gzipped bundle (JS + CSS, excluding atlas and fonts)');
for (const f of counted) console.log(`  ${kb(f.gz)}  ${f.rel}`);
console.log(`  ${'-'.repeat(10)}`);
console.log(
  `  ${kb(total)}  total   budget ${kb(BUDGET)}  (${((total / BUDGET) * 100).toFixed(1)}% used)`,
);

if (total > BUDGET) {
  console.error(`\nBundle size check FAILED: ${total} bytes over a ${BUDGET} byte budget.`);
  process.exit(1);
}
