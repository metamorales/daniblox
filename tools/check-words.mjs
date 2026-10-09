#!/usr/bin/env node
/**
 * Originality word check (spec R11.9 plus the imitation list from plan.md 3.8).
 *
 * The forbidden terms are assembled from fragments on purpose: if they were
 * written as plain literals this file would flag itself, and excluding the
 * checker from its own scan would be a loophole.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();

// Allowed only in docs/SPEC.md, which is stored verbatim.
const REPO_WIDE = [
  'mine' + 'craft',
  'mo' + 'jang',
  'ste' + 've',
  'cree' + 'per',
  'cobble' + 'stone',
];
const SPEC_EXEMPT = join('docs', 'SPEC.md');

// Allowed in docs (we discuss the decision there) but never in shipped code or assets.
const CODE_ONLY = [
  'poke' + 'mon',
  'pika' + 'chu',
  'nin' + 'tendo',
  'game' + 'freak',
  'rob' + 'lox',
];
const CODE_DIRS = ['src', 'public'];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);
const BINARY = new Set([
  '.woff2',
  '.woff',
  '.ttf',
  '.otf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp3',
  '.wav',
  '.ico',
  '.pdf',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!BINARY.has(extname(entry).toLowerCase())) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8').toLowerCase();
  const lines = text.split('\n');
  const inCode = CODE_DIRS.includes(rel.split(sep)[0]);

  for (const term of REPO_WIDE) {
    if (rel === SPEC_EXEMPT) continue;
    lines.forEach((line, i) => {
      if (line.includes(term)) failures.push(`${rel}:${i + 1}  forbidden term "${term}"`);
    });
  }
  if (inCode) {
    for (const term of CODE_ONLY) {
      lines.forEach((line, i) => {
        if (line.includes(term)) failures.push(`${rel}:${i + 1}  imitation term "${term}"`);
      });
    }
  }
}

if (failures.length) {
  console.error('Originality word check FAILED:');
  for (const f of failures) console.error('  ' + f);
  console.error(
    `\n${REPO_WIDE.length} terms are banned everywhere except ${SPEC_EXEMPT}; ` +
      `${CODE_ONLY.length} more are banned inside ${CODE_DIRS.join('/ and ')}/.`,
  );
  process.exit(1);
}
console.log(
  `Originality word check passed (${REPO_WIDE.length} repo-wide terms, ${CODE_ONLY.length} code-only terms).`,
);
