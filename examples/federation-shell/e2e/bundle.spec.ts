import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import {
  DECK_PLAN,
  RNG,
  SHIP_STATE,
  SIM_CLOCK,
  TELEMETRY,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';

import { DISTS } from './dists.ts';

const examples = join(import.meta.dirname, '../..');

/**
 * The descriptions of the simulation's tokens. A minifier keeps a token's
 * description as a string literal and renames function names, so these
 * strings show the library in a bundle.
 */
const SIMULATION = [
  TICK_LOOP,
  SHIP_STATE,
  SIM_CLOCK,
  RNG,
  DECK_PLAN,
  TELEMETRY,
].map(String);

/** Every script under one dist, in any folder. */
async function scripts(dist: string): Promise<string[]> {
  const root = join(examples, dist);
  const files = await readdir(root, { recursive: true });
  return files
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(root, file));
}

for (const dist of DISTS)
  test(`keeps the simulation out of ${dist}`, async () => {
    const files = await scripts(dist);
    expect(files.length, `scripts in ${dist}`).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const sentinel of SIMULATION)
        expect(text, `${sentinel} in ${file}`).not.toContain(sentinel);
    }
  });
