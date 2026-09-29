/**
 * K14 (core spec 17.3): create, 10,000 get() and 1,000 createScope over 50
 * and 2,000 providers, no plugin, hook sites on against compiled out.
 *
 * Each operation runs in 10 fresh pairs of worker processes, 20 measured
 * rounds per pair. One pair alone reports a tight interval around an
 * offset that a restart moves by several percent (JIT decisions and heap
 * layout differ per process), so the bootstrap draws whole pairs and the
 * interval carries the run-to-run noise the spec bounds against.
 *
 * `--quick` runs 2 pairs of 2 warm-up and 5 measured rounds for a local
 * smoke test.
 */
import {
  dispatchVerdict,
  forkWorker,
  interleave,
  pairedRatio,
  summarize,
} from '@nexusdi/bench-kit';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildDispatch } from './build.mjs';

const quick = process.argv.includes('--quick');
const warmup = quick ? 2 : 20;
const pairs = quick ? 2 : 10;
const perPair = quick ? 5 : 20;
const seed = Number(process.env.BENCH_SEED ?? Date.now() % 2 ** 31);
const out = join(import.meta.dirname, '..', 'tmp', 'bench');
const paths = await buildDispatch(out);
const worker = join(import.meta.dirname, 'worker.mjs');

/** Measured samples of `name` from every pair, in pair order. */
async function measure(name) {
  const samples = { on: [], off: [] };
  for (let pair = 0; pair < pairs; pair++) {
    const on = forkWorker('on', worker, [paths.on]);
    const off = forkWorker('off', worker, [paths.off]);
    try {
      const s = await interleave([on, off], name, {
        warmup,
        measured: perPair,
        seed: seed + pair,
      });
      samples.on.push(...s.on.measured);
      samples.off.push(...s.off.measured);
    } finally {
      on.close();
      off.close();
    }
  }
  return samples;
}

const results = [];
for (const size of [50, 2000]) {
  for (const op of ['create', 'get', 'createScope']) {
    const name = `${op}-${size}`;
    const s = await measure(name);
    const ratio = pairedRatio(s.on, s.off, seed, 10_000, perPair);
    const verdict = quick ? 'inconclusive' : dispatchVerdict(ratio);
    results.push({
      op,
      size,
      on: summarize(s.on),
      off: summarize(s.off),
      ratio,
      verdict,
    });
    console.log(
      `${verdict.padEnd(12)} ${name.padEnd(18)} on/off ${ratio.median.toFixed(
        4,
      )} [${ratio.low.toFixed(4)}, ${ratio.high.toFixed(4)}]`,
    );
  }
}
writeFileSync(
  join(out, 'dispatch.json'),
  JSON.stringify({ seed, pairs, perPair, results }, null, 2) + '\n',
);
process.exit(results.some((r) => r.verdict === 'fail') ? 1 : 0);
