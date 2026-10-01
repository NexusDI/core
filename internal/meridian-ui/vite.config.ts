/// <reference types='vitest' />
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const here = import.meta.dirname;

/**
 * Emits `dist/styles.css`: `src/styles.css` with its one `@import` replaced by
 * the generated token file. Nothing under `src/` imports a stylesheet, so
 * Vite's CSS pipeline never sees it.
 */
function stylesheet(): Plugin {
  const entry = join(here, 'src', 'styles.css');

  return {
    name: 'meridian-stylesheet',
    generateBundle() {
      let source: string;
      try {
        source = readFileSync(entry, 'utf8');
      } catch {
        return;
      }
      const inlined = source.replace(
        /^@import\s+'([^']+)';$/m,
        (_match, specifier: string) =>
          readFileSync(resolve(dirname(entry), specifier), 'utf8').trimEnd(),
      );
      this.emitFile({ type: 'asset', fileName: 'styles.css', source: inlined });
    },
  };
}

export default defineConfig(() => ({
  root: here,
  cacheDir: '../../node_modules/.vite/internal/meridian-ui',
  plugins: [
    react(),
    dts({ entryRoot: 'src', tsconfigPath: join(here, 'tsconfig.lib.json') }),
    stylesheet(),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: {
        index: 'src/index.ts',
      },
      name: '@nexusdi/meridian-ui',
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { entryFileNames: '[name].js' },
    },
  },
  test: {
    watch: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
    projects: [
      {
        extends: true,
        test: {
          typecheck: {
            enabled: true,
            tsconfig: './tsconfig.spec.json',
            include: ['src/**/*.test-d.{ts,tsx}'],
          },
          name: '@nexusdi/meridian-ui',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['**/*.server.{test,spec}.{ts,tsx}'],
        },
      },
      {
        extends: true,
        resolve: { conditions: ['react-server'] },
        ssr: { resolve: { conditions: ['react-server'] } },
        test: {
          name: '@nexusdi/meridian-ui:react-server',
          globals: true,
          environment: 'node',
          include: ['src/**/*.server.{test,spec}.{ts,tsx}'],
          server: { deps: { inline: [/^react(\/|$)/] } },
        },
      },
    ],
  },
}));
