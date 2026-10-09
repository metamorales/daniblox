#!/usr/bin/env node
/**
 * Proves the architecture boundary rule actually fires.
 *
 * tests/lint/boundary.fixture.ts deliberately imports from src/ui. It is in the
 * global ESLint ignore list so `eslint .` stays clean, and is linted here with
 * ignores disabled. Exactly one no-restricted-imports error must come back.
 */
import { ESLint } from 'eslint';

const FIXTURE = 'tests/lint/boundary.fixture.ts';
const RULE = 'no-restricted-imports';

const eslint = new ESLint({ ignore: false });
const results = await eslint.lintFiles([FIXTURE]);
const hits = results.flatMap((r) => r.messages).filter((m) => m.ruleId === RULE);

if (hits.length !== 1) {
  console.error(
    `Import boundary check FAILED: expected exactly 1 ${RULE} error in ${FIXTURE}, got ${hits.length}.`,
  );
  for (const h of hits) console.error(`  line ${h.line}: ${h.message}`);
  if (hits.length === 0) {
    console.error('  The rule is not firing, so src/world|render|folk|brain are unprotected.');
  }
  process.exit(1);
}
console.log(`Import boundary check passed (${RULE} fired once on ${FIXTURE}).`);
