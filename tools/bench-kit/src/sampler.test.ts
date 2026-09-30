import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { forkWorker, interleave } from './sampler.ts';

const script = join(import.meta.dirname, '__fixtures__', 'echo-worker.ts');

describe('interleave', () => {
  it('collects one sample per worker per round, warm-up apart', async () => {
    const workers = [forkWorker('a', script), forkWorker('b', script)];
    try {
      const out = await interleave(workers, 'spin', {
        warmup: 3,
        measured: 10,
        seed: 1,
      });
      expect(out.a.warmup).toHaveLength(3);
      expect(out.a.measured).toHaveLength(10);
      expect(out.b.measured.every((ns) => ns > 0)).toBe(true);
    } finally {
      for (const w of workers) w.close();
    }
  });
  it('awaits async operations', async () => {
    const w = forkWorker('a', script);
    try {
      const out = await interleave([w], 'async', {
        warmup: 1,
        measured: 2,
        seed: 1,
      });
      expect(out.a.measured).toHaveLength(2);
    } finally {
      w.close();
    }
  });
  it('fails the run naming the worker, operation and round when a worker throws', async () => {
    const w = forkWorker('lib', script);
    try {
      await expect(
        interleave([w], 'boom', { warmup: 0, measured: 50, seed: 1 }),
      ).rejects.toThrow('lib boom round 2: fixture broke');
    } finally {
      w.close();
    }
  });
  it('fails the run naming the worker and operation when calibration throws', async () => {
    const w = forkWorker('lib', script);
    try {
      await expect(
        interleave([w], 'broken', { warmup: 0, measured: 5, seed: 1 }),
      ).rejects.toThrow('lib broken calibration: fixture broke');
    } finally {
      w.close();
    }
  });
  it('runs every worker at the largest calibrated batch when the batch is shared', async () => {
    const workers = [
      forkWorker('fast', script, ['50']),
      forkWorker('slow', script, ['600']),
    ];
    try {
      const own = await Promise.all(workers.map((w) => w.calibrate('sized')));
      expect(own[0]).toBeGreaterThan(own[1]);
      const out = await interleave(workers, 'sized', {
        warmup: 0,
        measured: 2,
        seed: 1,
        sharedBatch: true,
      });
      expect(out.fast.batch).toBe(out.slow.batch);
      expect(out.slow.batch).toBeGreaterThanOrEqual(own[0]);
      expect((await workers[1].sample('sized', 3)).batch).toBe(3);
    } finally {
      for (const w of workers) w.close();
    }
  });
  it('runs teardown after the timer stops', async () => {
    const w = forkWorker('a', script);
    try {
      const out = await interleave([w], 'teardown', {
        warmup: 0,
        measured: 3,
        seed: 1,
      });
      expect(out.a.batch).toBe(1);
      for (const ns of out.a.measured) expect(ns).toBeLessThan(3_000_000);
    } finally {
      w.close();
    }
  });
  it('fails a call whose reply answers another request', async () => {
    const w = forkWorker('lib', script);
    try {
      await expect(
        interleave([w], 'stray', { warmup: 0, measured: 1, seed: 1 }),
      ).rejects.toThrow(
        'lib stray calibration: expected calibrated for stray, got sample for other',
      );
    } finally {
      w.close();
    }
  });
  it('reports the heap one operation leaves allocated', async () => {
    const w = forkWorker('a', script);
    try {
      await w.calibrate('keep');
      expect(await w.heap('keep')).toBeGreaterThan(1000);
    } finally {
      w.close();
    }
  });
});
