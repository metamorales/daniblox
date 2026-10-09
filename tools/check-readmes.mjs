#!/usr/bin/env node
/** Every folder named in the spec layout needs a README.md of at most 5 lines. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FOLDERS = [
  'src/world',
  'src/render',
  'src/folk',
  'src/brain',
  'src/chat',
  'src/ui',
  'src/app',
  'public/atlas',
  'tests',
  'e2e',
  'tools',
];
const MAX_LINES = 5;

const failures = [];
for (const folder of FOLDERS) {
  const path = join(folder, 'README.md');
  if (!existsSync(path)) {
    failures.push(`${path} is missing`);
    continue;
  }
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) failures.push(`${path} is empty`);
  if (lines.length > MAX_LINES)
    failures.push(`${path} has ${lines.length} lines, max is ${MAX_LINES}`);
}

if (failures.length) {
  console.error('Folder README check FAILED:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`Folder README check passed (${FOLDERS.length} folders, max ${MAX_LINES} lines each).`);
