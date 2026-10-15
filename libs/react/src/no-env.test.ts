// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The app decides when react() runs (react spec 5, R4), so the package
// reads no environment variable of its own. dev.ts is the one exception:
// it reads process.env.NODE_ENV, which every React toolchain replaces at
// build time, for the development reload guard (react spec 12.3).
// tools/repo-checks core-layers.ts names the same file.
const NODE_ENV_READER = 'dev.ts';

describe('the package source', () => {
  it('reads neither process.env nor import.meta.env outside dev.ts', () => {
    const src = import.meta.dirname;
    const sources = readdirSync(src, {
      recursive: true,
      encoding: 'utf8',
    }).filter(
      (file) => /\.tsx?$/.test(file) && !/\.test(-d)?\.tsx?$/.test(file),
    );
    expect(sources).toContain(NODE_ENV_READER);
    for (const file of sources.filter((f) => f !== NODE_ENV_READER)) {
      const text = readFileSync(join(src, file), 'utf8');
      expect(text, file).not.toMatch(/process\.env|import\.meta\.env/);
    }
  });

  it('reads nothing but process.env.NODE_ENV in dev.ts', () => {
    const text = readFileSync(
      join(import.meta.dirname, NODE_ENV_READER),
      'utf8',
    ).replace(/process\.env\.NODE_ENV/g, '');
    expect(text).not.toMatch(/process\.env|import\.meta\.env/);
  });
});
