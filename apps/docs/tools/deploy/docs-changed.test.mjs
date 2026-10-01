// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { EXTRA_PATHS, PATHS, touches } from './docs-changed.mjs';

describe('the docs inputs', () => {
  it('name every workflow that builds or checks the site', () => {
    expect(EXTRA_PATHS).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/docs-next.yml',
      '.github/workflows/docs-snapshot.yml',
    ]);
  });
});

describe('touches', () => {
  it('matches a file under a /** path and an exact file', () => {
    expect(touches(PATHS, ['libs/core/src/index.ts'])).toBe(true);
    expect(touches(PATHS, ['package-lock.json'])).toBe(true);
    expect(touches(PATHS, ['.github/workflows/docs-next.yml'])).toBe(true);
    expect(touches(PATHS, ['benchmarks/results/size.json'])).toBe(true);
  });

  it('ignores a change outside every docs input', () => {
    expect(touches(PATHS, ['README.md', 'tools/release/stage.mjs'])).toBe(
      false,
    );
    expect(touches(PATHS, ['apps/docs-e2e/src/home.spec.ts'])).toBe(false);
  });
});
