import { defineConfig } from 'vitest/config';

// The edge-runtime leg: the test bundles test/edge/entry.ts and
// runs it inside @edge-runtime/vm, the VM of Vercel's Edge Runtime.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    fsModuleCachePath:
      '../../node_modules/.vite/examples/bridge-api-edge/fs-modules',
    name: '@nexusdi/bridge-api:edge-runtime',
    environment: 'node',
    include: ['test/edge/**/*.edge.test.ts'],
  },
});
