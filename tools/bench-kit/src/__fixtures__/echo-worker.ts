import { serveSamples } from '../serve.ts';

/**
 * Busy-waits past the 20 ms calibration warm-up, so the warm-up runs the
 * operation once and calibration settles on a batch of 1.
 */
function slow(): void {
  busy(21_000);
}

function busy(us: number): void {
  const end = process.hrtime.bigint() + BigInt(us) * 1000n;
  while (process.hrtime.bigint() < end);
}

let n = 0;
serveSamples({
  spin: {
    run: () => {
      let x = 0;
      for (let i = 0; i < 1000; i++) x += i;
      return x;
    },
  },
  // The warm-up and calibration run it once each, rounds 0 and 1 twice more,
  // and round 2 throws.
  boom: {
    run: () => {
      slow();
      if (++n > 4) throw new Error('fixture broke');
      return n;
    },
  },
  broken: {
    run: () => {
      throw new Error('fixture broke');
    },
  },
  async: { run: async () => 1 },
  sized: { run: () => busy(100) },
  // 1.1 ms per call fixes the batch at 1; the 3 ms teardown must stay
  // outside the sample.
  teardown: {
    run: () => {
      busy(1100);
      return 1;
    },
    teardown: () => busy(3000),
  },
  // Sends a message nobody asked for before each result.
  stray: {
    run: () => {
      process.send?.({ type: 'sample', op: 'other', ns: 1, batch: 1 });
      return 1;
    },
  },
  // Keeps an 8 KiB buffer per call alive, so the heap grows by it.
  keep: {
    setup: () => [] as unknown[],
    run: (kept) => (kept as unknown[]).push(new Array(1024).fill(0)),
  },
});
