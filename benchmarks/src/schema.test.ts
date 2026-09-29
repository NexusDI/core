import { describe, expect, it } from 'vitest';

import { SchemaError, validate } from './schema.ts';

const versions = {
  core: '0.4.0',
  libraries: {
    nexusdi: '0.4.0',
    inversify: '8.2.3',
    tsyringe: '4.10.0',
    awilix: '13.0.5',
    'needle-di': '1.2.1',
  },
  toolchains: { tsc: '6.0.3' },
  node: '24.20.0',
};
const design = (measured: number) => ({
  order: 'williams',
  warmup: 100,
  measured,
  bootstrap: { resamples: 10000, block: 10, prng: 'mulberry32' },
});
const timings = (measured: number) => ({
  schema: 1,
  sha: 'abc1234',
  startedAt: '2026-10-01T04:00:00Z',
  versions,
  runner: {
    os: 'linux',
    cpu: 'AMD EPYC 7763',
    cores: 4,
    memoryGb: 16,
    hosted: true,
  },
  seed: 1,
  design: { 'cold-start': design(measured), 'in-process': design(measured) },
  results: [],
});

describe('validate', () => {
  it('accepts a published timings file', () => {
    expect(() => validate('timings', timings(1000), 'results')).not.toThrow();
  });
  it('rejects a quick run under results/', () => {
    expect(() => validate('timings', timings(50), 'results')).toThrow(
      /design\.in-process\.measured/,
    );
  });
  it('accepts a quick run under tmp/', () => {
    expect(() => validate('timings', timings(50), 'tmp')).not.toThrow();
  });
  it('rejects an unknown schema version', () => {
    expect(() =>
      validate('timings', { ...timings(1000), schema: 2 }, 'results'),
    ).toThrow(SchemaError);
  });
  it('rejects an outcome outside the enum', () => {
    const cell = {
      library: 'nexusdi',
      variant: 'plain',
      toolchain: 'tsc',
      profile: 'none',
      sections: { singleton: 'pass', transient: 'pass', scoped: 'ok' },
      outcome: 'pass',
      polyfill: null,
    };
    expect(() =>
      validate('matrix', { schema: 1, versions, cells: [cell] }, 'results'),
    ).toThrow(/cells\[0\]\.sections\.scoped/);
  });
});
