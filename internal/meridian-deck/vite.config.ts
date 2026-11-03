/// <reference types='vitest' />
import { join } from 'node:path';

import { defaultServerConditions, defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const here = import.meta.dirname;

export default defineConfig(() => ({
  root: here,
  cacheDir: '../../node_modules/.vite/internal/meridian-deck',
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: join(here, 'tsconfig.lib.json'),
      // The plugin logs a declaration diagnostic and carries on, so a build
      // run before `@nexusdi/meridian-systems:typecheck` has emitted its
      // declarations (TS6305) would publish declarations with the imported
      // types gone. The `build` target depends on `^typecheck` for that
      // order, and a diagnostic that still appears fails the build.
      afterDiagnostic(diagnostics) {
        if (diagnostics.length > 0) {
          const first = diagnostics[0]?.messageText;
          throw new Error(
            `The declarations did not build (${diagnostics.length} diagnostics): ${typeof first === 'string' ? first : first?.messageText}`,
          );
        }
      },
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      // `.` is the deck state and holds no Pixi. `./maps` runs the map files
      // over it and imports meridian-systems by `import type` alone.
      // `./bindings` turns ship telemetry into patches and imports the ship
      // geometry at run time. `./view` is the one entry that imports Pixi,
      // and the app loads it with an import(). `./testing` holds the fake
      // source and imports `.` alone.
      entry: {
        index: 'src/state/index.ts',
        maps: 'src/maps/index.ts',
        view: 'src/view/index.ts',
        bindings: 'src/bindings/index.ts',
        testing: 'src/testing/index.ts',
      },
      name: '@nexusdi/meridian-deck',
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: [/^@nexusdi\/core/, /^@nexusdi\/meridian-systems/, /^pixi\.js/],
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
    include: ['src/**/*.{test,spec}.ts', 'tools/**/*.test.mjs'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
