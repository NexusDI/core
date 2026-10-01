import { describe, expect, it } from 'vitest';

import type { ModuleDefinition } from '../src/index.js';
import * as core from '../src/index.js';
import { makeModularGraph } from './graph.mjs';

const WARMUP = 15;
const RUNS = 41;
/**
 * Splitting 301 providers over 32 modules may cost at most this much more
 * create time than one module holding them all. The visibility pass is
 * linear in what each module sees, so the ratio stays near 1.5.
 */
const BOUND = 2;

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
    // Interleaved, so load on the machine hits both sides alike.
    const times = { flat: [] as number[], modular: [] as number[] };
    for (let i = 0; i < RUNS; i++) {
      times.flat.push(await createOnce(flat));
      times.modular.push(await createOnce(modular));
    }
    const ratio = median(times.modular) / median(times.flat);
    expect(
      ratio,
      `modular ${median(times.modular).toFixed(2)} ms, flat ${median(times.flat).toFixed(2)} ms`,
    ).toBeLessThanOrEqual(BOUND);
  });
});
