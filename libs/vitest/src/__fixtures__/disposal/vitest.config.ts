import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['disposal.fixture.ts'], watch: false },
});
