// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('the built entry', () => {
  // A bundler treats the module as a client boundary only when the directive
  // is the first statement, and some bundlers strip a directive they do not
  // find there (react spec 16). The test target builds first.
  it("starts with 'use client'", () => {
    const built = readFileSync(
      // fallow-ignore-next-line unresolved-import
      new URL('../dist/index.js', import.meta.url),
      'utf8',
    );
    expect(built.split('\n')[0]).toBe("'use client';");
  });
});
