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

  it('gives a chip its kind hue from its own kind class and from an ancestor', () => {
    // The reference loader puts the chip inside the entry's kind wrapper, and
    // the API filter puts the kind class on the toggle chip itself.
    const rule = /([^{}]+)\{[^}]*color: var\(--meridian-kind\)/.exec(source);
    const selectors = (rule?.[1] ?? '').split(',').map((each) => each.trim());
    expect(selectors).toEqual(
      expect.arrayContaining([
        "[class*='meridian-kind-'] .meridian-chip",
        ".meridian-chip[class*='meridian-kind-']",
      ]),
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
