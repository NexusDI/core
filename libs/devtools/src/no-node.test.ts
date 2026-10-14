import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = new URL('.', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.ts$/.test(entry.name) &&
      !/\.test(-d)?\.ts$|\.trace\.ts$/.test(entry.name)
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
});
