import { describe, expect, it } from 'vitest';

import { headlineOf, planRounds } from './build-rounds.ts';

describe('planRounds', () => {
  it('builds every cell once per round in a rotating order', () => {
    const rounds = planRounds(['a', 'b', 'c', 'd'], 8, 1);
    expect(rounds).toHaveLength(8);
    for (const r of rounds) expect([...r].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(rounds.map((r) => r[0])).size).toBe(4);
  });
});

describe('headlineOf', () => {
  const cell = (toolchain: string, median: number, outcome = 'pass') => ({
    variant: 'decorated',
    toolchain,
    median,
    outcome,
  });
  it('picks the fastest passing cell on a documented toolchain', () => {
    expect(
      headlineOf({ documentedToolchains: ['tsc', 'tsgo'] }, [
        cell('esbuild', 100),
        cell('tsgo', 300),
        cell('tsc', 900),
      ]),
    ).toEqual({ variant: 'decorated', toolchain: 'tsgo' });
  });
  it('accepts any toolchain when the docs name none', () => {
    expect(
      headlineOf({ documentedToolchains: 'any' }, [
        cell('esbuild', 100),
        cell('tsc', 900),
      ])?.toolchain,
    ).toBe('esbuild');
  });
  it('skips failing cells', () => {
    expect(
      headlineOf({ documentedToolchains: 'any' }, [
        cell('esbuild', 100, 'runtime-error'),
        cell('tsc', 900),
      ])?.toolchain,
    ).toBe('tsc');
  });
});
