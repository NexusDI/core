/**
 * K14 sensitivity check (benchmarks spec 14.6, issue #206). Plants a serial
 * Math.imul chain of N steps at the `canon` site of getFrom and runs get-50
 * through K14's own sampler and verdict, with its extension, against the off
 * build.
 *
 * It first measures the plant on its own: the planted bundle at N against the
 * same bundle at N = 0. That ratio has to be at least 1.05, or the plant is
 * too small for this machine and the check exits 2 without judging K14. When
 * the plant is large enough and K14 does not block, it exits 1. A crash
 * exits 3. Exit 0 means K14 blocked the plant.
 *
 * N comes from K14_PLANT_N, default PLANT_N below.
 */
import {
  clusteredRatio,
  dispatchBlocks,
  dispatchVerdict,
  forkWorker,
  interleave,
} from '@nexusdi/bench-kit';
import { join } from 'node:path';

import { buildDispatch, buildPlanted } from './build.mjs';
import { execArgvFor } from './exec-argv.mjs';

/** Calibrated on a GitHub runner (spec 14.6): the plant reads 1.07 against the plant off. */
const PLANT_N = 20;
const MIN_PLANT = 1.05;
const n = Number(process.env.K14_PLANT_N ?? PLANT_N);
const warmup = 20;
const pairs = 20;
const extension = 40;
const perPair = 20;
const seed = Number(process.env.BENCH_SEED ?? Date.now() % 2 ** 31);
const out = join(import.meta.dirname, '..', 'tmp', 'bench');
const worker = join(import.meta.dirname, 'worker.mjs');
const OP = 'get-50';

/** Pairs `from` to `to - 1` of a (numerator) against b (denominator), same op. */
async function measure(a, b, samples, from, to) {
  for (let pair = from; pair < to; pair++) {
    const wa = forkWorker('on', worker, [a], execArgvFor(OP));
    const wb = forkWorker('off', worker, [b], execArgvFor(OP));
    try {
      const s = await interleave([wa, wb], OP, {
        warmup,
        measured: perPair,
        seed: seed + pair,
        sharedBatch: true,
      });
      samples.on.push(...s.on.measured);
      samples.off.push(...s.off.measured);
    } finally {
      wa.close();
      wb.close();
    }
  }
  return samples;
}

const show = (label, r) =>
  console.log(
    `${label} ${r.median.toFixed(4)} [${r.low.toFixed(4)}, ${r.high.toFixed(4)}]`,
  );

async function main() {
  const { off } = await buildDispatch(out);
  const planted = await buildPlanted(out);
  const own = await measure(
    `${planted}?k14spin=${n}`,
    `${planted}?k14spin=0`,
    { on: [], off: [] },
    0,
    pairs,
  );
  const plantRatio = clusteredRatio(own.on, own.off, seed, perPair);
  show(`plant N=${n} on(N)/on(0)`, plantRatio);
  if (plantRatio.median < MIN_PLANT) {
    console.error(
      `plant too small: on(N)/on(0) is ${plantRatio.median.toFixed(4)}, below ${MIN_PLANT}. Raise K14_PLANT_N.`,
    );
    return 2;
  }

  const s = await measure(
    `${planted}?k14spin=${n}`,
    off,
    { on: [], off: [] },
    0,
    pairs,
  );
  let ratio = clusteredRatio(s.on, s.off, seed, perPair);
  let verdict = dispatchVerdict(ratio);
  if (verdict === 'inconclusive') {
    await measure(`${planted}?k14spin=${n}`, off, s, pairs, pairs + extension);
    ratio = clusteredRatio(s.on, s.off, seed, perPair);
    verdict = dispatchVerdict(ratio);
  }
  const blocks = dispatchBlocks(verdict, ratio);
  show(`${verdict} ${OP} planted/off ${blocks ? 'BLOCKS' : 'PASSES'}`, ratio);
  if (!blocks) {
    console.error(
      `K14 missed a planted ${((plantRatio.median - 1) * 100).toFixed(1)}% hook-site cost`,
    );
    return 1;
  }
  return 0;
}

try {
  process.exit(await main());
} catch (error) {
  console.error(error);
  process.exit(3);
}
