import { serveSamples } from '../serve.ts';

/** Busy-waits past the 1 ms calibration target, so calibration settles on a batch of 1. */
function slow(): void {
  const end = process.hrtime.bigint() + 1_500_000n;
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
  // Calibration runs it once, rounds 0 and 1 run it twice more, round 2 throws.
  boom: {
    run: () => {
      slow();
      if (++n > 3) throw new Error('fixture broke');
      return n;
    },
  },
  broken: {
    run: () => {
      throw new Error('fixture broke');
    },
  },
  async: { run: async () => 1 },
  // Keeps an 8 KiB buffer per call alive, so the heap grows by it.
  keep: {
    setup: () => [] as unknown[],
    run: (kept) => (kept as unknown[]).push(new Array(1024).fill(0)),
  },
});
