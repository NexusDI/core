import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import swc from 'unplugin-swc';

import { decoratorsParser, decoratorsTransform } from './swc.decorators';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/federation-command',
  plugins: [
    swc.vite({
      // false keeps the plugin from reading experimentalDecorators out of a
      // tsconfig and lowering the legacy form.
      tsconfigFile: false,
      jsc: {
        parser: { syntax: 'typescript', tsx: true, ...decoratorsParser },
        transform: {
          ...decoratorsTransform,
          react: { runtime: 'automatic' },
        },
        target: 'es2022',
      },
    }),
    react(),
  ],
  test: {
    name: '@nexusdi/federation-command',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
