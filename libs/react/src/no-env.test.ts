// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The app decides when react() runs (react spec 5, R4), so the package
// reads no environment variable of its own.
describe('the package source', () => {
  it('reads neither process.env nor import.meta.env', () => {
    const src = import.meta.dirname;
    const sources = readdirSync(src, {
      recursive: true,
      encoding: 'utf8',
    }).filter(
      (file) => /\.tsx?$/.test(file) && !/\.test(-d)?\.tsx?$/.test(file),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(join(src, file), 'utf8');
      expect(text, file).not.toMatch(/process\.env|import\.meta\.env/);
    }
  });
});
