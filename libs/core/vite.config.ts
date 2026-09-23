import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/core',
  // Vite's own tsconfig auto-discovery walks parent directories looking for
  // the nearest tsconfig.json, with no boundary at the workspace root. In a
  // git worktree that walk can escape the worktree entirely; naming the file
  // explicitly is what keeps it from resolving anything but this project's own.
  tsconfig: './tsconfig.spec.json',
  plugins: [],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    sourcemap: false,
  },
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      exclude: [
        '**/index.ts',
        'dist/**/*',
        'vite.config.ts',
        'eslint.config.mjs',
        './src/types.ts',
      ],
    },
  },
}));
