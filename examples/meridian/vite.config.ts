import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

// Build tooling the decorators package owns; the interceptors package imports
// it the same way.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { standardDecorators } from '../../libs/decorators/vite.decorators.ts';

// docExamples() returns its own `plugins` array, which a plain object spread
// would replace. Pulled apart so both plugin sets run.
const { plugins: docExamplePlugins, ...docExampleConfig } = docExamples();

/**
 * The Starship Meridian examples the docs site renders (spec 7.1). Every
 * region a page cites sits in an `.md` file under `src/`, and every
 * `ts @import.meta.vitest` block there runs as a test, so a region the site
 * shows is a region this project ran.
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/examples/meridian',
  tsconfig: './tsconfig.spec.json',
  ...docExampleConfig,
  plugins: [standardDecorators(), ...docExamplePlugins],
  test: {
    name: '@nexusdi/meridian',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    includeSource: [...docExampleSources(), 'src/**/*.md'],
    reporters: ['default'],
  },
}));
