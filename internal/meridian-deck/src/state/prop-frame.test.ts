import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The quoted members of `export type <name> = ...;` in a source file. */
function members(file: string, name: string): string[] {
  const text = readFileSync(file, 'utf8');
  const match = new RegExp(`export type ${name}\\s*=([^;]+);`).exec(text);
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)]
    .map((hit) => hit[1] ?? '')
    .sort();
}

describe('PropFrame', () => {
  it('lists the members of the geometry PropState', () => {
    const here = import.meta.dirname;
    const frames = members(join(here, 'contracts.ts'), 'PropFrame');
    const states = members(
      join(
        here,
        '../../../../examples/meridian-systems/src/geometry/ship-geometry.ts',
      ),
      'PropState',
    );
    expect(states.length).toBeGreaterThan(0);
    expect(frames).toEqual(states);
  });
});
