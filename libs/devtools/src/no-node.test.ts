import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = new URL('.', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.ts$/.test(entry.name) && !/\.test(-d)?\.ts$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('devtools runs in a browser', () => {
  it('imports no node: module outside tests', () => {
    const found = sources(SRC).filter((file) =>
      /from ['"]node:|import\(['"]node:/.test(readFileSync(file, 'utf8')),
    );
    expect(found).toEqual([]);
  });

  it('reads no process global outside tests (spec 6.4)', () => {
    const found = sources(SRC).filter((file) =>
      /\bprocess\s*[.[?]|globalThis\s*\.\s*process\b/.test(
        // Comments may name process; code may not read it.
        readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, ''),
      ),
    );
    expect(found).toEqual([]);
  });
});
