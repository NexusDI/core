import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import swc from 'unplugin-swc';

import { docExamples } from '@nexusdi/doc-examples';

import { decoratorsParser, decoratorsTransform } from './swc.decorators';

const doctests = docExamples();

export default defineConfig(() => ({
  root: import.meta.dirname,
  resolve: doctests.resolve,
  ssr: doctests.ssr,
  cacheDir: '../../node_modules/.vite/examples/federation-command',
  plugins: [
    ...doctests.plugins,
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
    // The README's doctests run with the project's tests.
    includeSource: ['README.md'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
