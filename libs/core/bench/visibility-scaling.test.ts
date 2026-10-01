import { describe, expect, it } from 'vitest';

import type { ModuleDefinition } from '../src/index.js';
import * as core from '../src/index.js';
import { makeModularGraph } from './graph.mjs';

const WARMUP = 15;
const ROUNDS = 5;
const RUNS = 21;
/**
 * Splitting 301 providers over 32 modules may cost at most this much more
 * create time than one module holding them all. The visibility pass is
 * linear in what each module sees, so the ratio stays near 1.3; a pass that
 * solves every token in every module sits near 6.
 */
const BOUND = 3;

async function createOnce(root: ModuleDefinition): Promise<number> {
  const start = performance.now();
  const ship = await core.Nexus.create(root);
  const took = performance.now() - start;
  await ship[Symbol.asyncDispose]();
  return took;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

describe('visibility scaling', () => {
  it(`keeps a 32-module create within ${BOUND}x of the same providers in one module`, async () => {
    const modular = makeModularGraph(core).root as ModuleDefinition;
    const modules = modular.imports as ModuleDefinition[];
    const flat = core.defineModule({
      name: 'Flat',
      providers: modules.flatMap((m) => [...m.providers]) as never,
    });

    for (let i = 0; i < WARMUP; i++) {
      await createOnce(flat);
      await createOnce(modular);
    }
    // Each round interleaves the two sides, so load hits both alike, and
    // takes the ratio of their medians. Load only raises a round's ratio, so
    // the lowest round is the one to check.
    const ratios: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const flatTimes: number[] = [];
      const modularTimes: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        flatTimes.push(await createOnce(flat));
        modularTimes.push(await createOnce(modular));
      }
      ratios.push(median(modularTimes) / median(flatTimes));
    }
    expect(
      Math.min(...ratios),
      `ratios per round: ${ratios.map((r) => r.toFixed(2)).join(', ')}`,
    ).toBeLessThanOrEqual(BOUND);
  });
});
