/**
 * K14 (core spec 17.3): create, 10,000 get() and 1,000 createScope over 50
 * and 2,000 providers, no plugin, hook sites on against compiled out.
 *
 * Each operation runs in 10 fresh pairs of worker processes, 20 measured
 * rounds per pair. One pair alone reports a tight interval around an
 * offset that a restart moves by several percent (JIT decisions and heap
 * layout differ per process), so clusteredRatio resamples whole pairs and
 * the interval carries the run-to-run noise the spec bounds against. Both
 * workers of a pair run the larger of their two calibrated batches.
 *
 * A case that comes out inconclusive runs 20 more pairs, once, and the
 * verdict is taken again over all 30 (spec 14.6). The job then fails on a
 * `fail`, and on an `inconclusive` whose median is above 1.03.
 *
 * `--quick` runs 2 pairs of 2 warm-up and 5 measured rounds for a local
 * smoke test, with no verdict and no extension.
 */
import {
  clusteredRatio,
  dispatchBlocks,
  dispatchVerdict,
  forkWorker,
  interleave,
  summarize,
} from '@nexusdi/bench-kit';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildDispatch } from './build.mjs';

const quick = process.argv.includes('--quick');
const warmup = quick ? 2 : 20;
const pairs = quick ? 2 : 10;
const extension = 20;
const perPair = quick ? 5 : 20;
const seed = Number(process.env.BENCH_SEED ?? Date.now() % 2 ** 31);
const out = join(import.meta.dirname, '..', 'tmp', 'bench');
const paths = await buildDispatch(out);
const worker = join(import.meta.dirname, 'worker.mjs');

/** Adds the measured samples and batch of pairs `from` to `to - 1` of `name` to `samples`. */
async function measure(name, samples, from, to) {
  for (let pair = from; pair < to; pair++) {
    const on = forkWorker('on', worker, [paths.on]);
    const off = forkWorker('off', worker, [paths.off]);
    try {
      const s = await interleave([on, off], name, {
        warmup,
        measured: perPair,
        seed: seed + pair,
        sharedBatch: true,
      });
      samples.on.push(...s.on.measured);
      samples.off.push(...s.off.measured);
      samples.batches.push(s.on.batch);
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
    const s = await measure(name, { on: [], off: [], batches: [] }, 0, pairs);
    let ratio = clusteredRatio(s.on, s.off, seed, perPair);
    let verdict = quick ? 'inconclusive' : dispatchVerdict(ratio);
    const extended = !quick && verdict === 'inconclusive';
    if (extended) {
      await measure(name, s, pairs, pairs + extension);
      ratio = clusteredRatio(s.on, s.off, seed, perPair);
      verdict = dispatchVerdict(ratio);
    }
    const blocks = !quick && dispatchBlocks(verdict, ratio);
    results.push({
      op,
      size,
      pairs: s.batches.length,
      extended,
      batches: s.batches,
      on: summarize(s.on),
      off: summarize(s.off),
      ratio,
      verdict,
      blocks,
    });
    console.log(
      `${verdict.padEnd(12)} ${name.padEnd(18)} on/off ${ratio.median.toFixed(
        4,
      )} [${ratio.low.toFixed(4)}, ${ratio.high.toFixed(4)}] pairs ${
        s.batches.length
      }${blocks ? ' BLOCKS' : ''}`,
    );
  }
}
writeFileSync(
  join(out, 'dispatch.json'),
  JSON.stringify({ seed, pairs, extension, perPair, results }, null, 2) + '\n',
);
process.exit(results.some((r) => r.blocks) ? 1 : 0);
