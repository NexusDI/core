import { defineConfig } from 'vitest/config';

// libs/vitest also runs against Vitest 4 (the adapter-peers legs), whose
// InlineConfig has no fsModuleCachePath, so the options sit in a variable
// and escape the excess-property check. Vitest 4 leaves the module cache off.
const test = {
  include: ['disposal.fixture.ts'],
  watch: false,
  fsModuleCachePath:
    '../../../../../node_modules/.vite/libs/vitest-disposal/fs-modules',
};

export default defineConfig({ test });
