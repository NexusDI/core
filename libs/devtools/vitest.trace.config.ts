import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/devtools-trace',
  test: {
    name: '@nexusdi/devtools:trace',
    watch: false,
    environment: 'node',
    include: ['src/**/*.trace.test.ts'],
    reporters: ['default'],
  },
});
