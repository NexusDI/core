import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
// vitest/config's defineConfig is vite's, typed with the test block.
import { defineConfig } from 'vitest/config';

import { docExamples } from '@nexusdi/doc-examples';

// docExamples() adds the @nexusdi/source resolve condition, which would point
// the app build and the dev server at library sources. It applies under Vitest
// only, so every test, the README's doctests included, resolves @nexusdi/*
// from source.
const doctests = process.env.VITEST ? docExamples() : undefined;

export default defineConfig({
  // Nx loads this file from the workspace root, and reactRouter() finds
  // app/ from the root, so the root is this folder.
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/bridge-console',
  // Vite looks for a tsconfig in parent folders with no stop at the
  // workspace root, so it can leave the git worktree. This names the file.
  tsconfig: './tsconfig.app.json',
  plugins: [
    tailwindcss(),
    !process.env.VITEST && reactRouter(),
    ...(doctests?.plugins ?? []),
  ],
  resolve: {
    tsconfigPaths: true,
    ...doctests?.resolve,
  },
  // The library exports .ts source, so the server build bundles it.
  ssr: {
    noExternal: ['@nexusdi/meridian-systems'],
    ...doctests?.ssr,
  },
  test: {
    name: '@nexusdi/bridge-console',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    // The README's doctests run with the project's tests.
    includeSource: ['README.md'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
