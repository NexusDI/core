import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');

describe('src/styles.css', () => {
  it('imports the generated tokens first', () => {
    expect(source).toMatch(
      /^(\/\*[\s\S]*?\*\/\s*)?@import '\.\/tokens\.generated\.css';/,
    );
  });

  it('carries no literal colour and reads only --meridian- properties', () => {
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []).toEqual([]);
    const reads = [...body.matchAll(/var\((--[\w-]+)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(reads.filter((name) => !name.startsWith('--meridian-'))).toEqual([]);
  });
});
