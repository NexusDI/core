import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
// vitest/config's defineConfig is vite's, typed with the test block.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nx loads this file from the workspace root, and reactRouter() finds
  // app/ from the root, so the root is this folder.
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/bridge-console',
  // Vite looks for a tsconfig in parent folders with no stop at the
  // workspace root, so it can leave the git worktree. This names the file.
  tsconfig: './tsconfig.app.json',
  plugins: [tailwindcss(), !process.env.VITEST && reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: '@nexusdi/bridge-console',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
});
