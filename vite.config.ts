import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// base must match the GitHub Pages repo path: metamorales.github.io/daniblox/
export default defineConfig({
  base: '/daniblox/',
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep Three.js in its own named chunk so the no-WebGL e2e can assert
        // it was never requested.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
