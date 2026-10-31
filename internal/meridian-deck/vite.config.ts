/// <reference types='vitest' />
import { join } from 'node:path';

import { defaultServerConditions, defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const here = import.meta.dirname;

export default defineConfig(() => ({
  root: here,
  cacheDir: '../../node_modules/.vite/internal/meridian-deck',
  plugins: [
    dts({ entryRoot: 'src', tsconfigPath: join(here, 'tsconfig.lib.json') }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      // `.` is the deck state and holds no Pixi. `./view` is the one entry
      // that imports it, and the app loads it with an import().
      entry: {
        index: 'src/state/index.ts',
        view: 'src/view/index.ts',
      },
      name: '@nexusdi/meridian-deck',
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: [/^@nexusdi\/core/, /^pixi\.js/],
      output: { entryFileNames: '[name].js' },
    },
  },
  // The tests read @nexusdi/core from its source, so no build has to run
  // first. Vitest resolves a bare specifier with the ssr lists.
  resolve: { conditions: ['@nexusdi/source', ...defaultServerConditions] },
  ssr: {
    resolve: {
      conditions: ['@nexusdi/source', ...defaultServerConditions],
      externalConditions: ['@nexusdi/source', ...defaultServerConditions],
    },
  },
  test: {
    name: '@nexusdi/meridian-deck',
    fsModuleCachePath:
      '../../node_modules/.vite/internal/meridian-deck/fs-modules',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
