import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * src/world, src/render, src/folk and src/brain must never import from src/ui.
 * The same rule block is applied to the committed negative fixture so
 * `npm run check:boundary` can prove the rule actually fires.
 */
const noUiImports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/ui', '**/ui/**'],
            message:
              'src/world, src/render, src/folk and src/brain must not import from src/ui. Communicate through signals and events.',
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.scratch/**',
      'tests/lint/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  { files: ['src/{world,render,folk,brain}/**/*.{ts,tsx}'], ...noUiImports },
  { files: ['tests/lint/boundary.fixture.ts'], ...noUiImports },
);
