import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { BENCHMARKS } from '../libraries.ts';
import { sharedInstallName, testConsumer } from './test-consumer.ts';

const NAME = 'test-consumer-unit';
const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
  const tmp = join(BENCHMARKS, 'tmp');
  for (const entry of existsSync(tmp) ? readdirNames(tmp) : [])
    if (entry.startsWith(`${NAME}-`))
      rmSync(join(tmp, entry), { recursive: true, force: true });
});
const readdirNames = (d: string) => readdirSync(d);

/** An installer that writes a node_modules and counts its calls. */
function counting() {
  const calls: string[][] = [];
  const install = (dir: string, specs: string[]) => {
    calls.push(specs);
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'marker'), 'x');
  };
  return { calls, install };
}

describe('testConsumer', () => {
  it('installs once per pin set and reuses it', () => {
    const { calls, install } = counting();
    made.push(testConsumer(NAME, ['awilix'], install));
    made.push(testConsumer(NAME, ['awilix'], install));
    expect(calls).toHaveLength(1);
  });
  it('installs again when the pins change', () => {
    const { calls, install } = counting();
    made.push(testConsumer(NAME, ['awilix'], install));
    made.push(testConsumer(NAME, ['tsyringe'], install));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.at(-1)?.some((s) => s.startsWith('tsyringe@'))).toBe(true);
  });
  it('gives each call its own run directory with its own cells', () => {
    const { install } = counting();
    const a = testConsumer(NAME, ['awilix'], install);
    const b = testConsumer(NAME, ['awilix'], install);
    made.push(a, b);
    expect(a).not.toBe(b);
    mkdirSync(join(a, 'cells', 'x'), { recursive: true });
    expect(existsSync(join(b, 'cells', 'x'))).toBe(false);
    // Both reach the one shared install.
    expect(existsSync(join(a, 'node_modules', 'marker'))).toBe(true);
    expect(existsSync(join(b, 'node_modules', 'marker'))).toBe(true);
  });
  it('leaves no staging directory behind, and a failed install leaves no install', () => {
    const madeInstalls = new Set(readdirNames(join(BENCHMARKS, 'tmp')));
    const failing = () => {
      throw new Error('npm exploded');
    };
    expect(() => testConsumer(NAME, ['needle-di'], failing)).toThrow(
      /npm exploded/,
    );
    const left = readdirNames(join(BENCHMARKS, 'tmp')).filter(
      (e) =>
        e.startsWith(`${NAME}-staging-`) ||
        (e.startsWith(`${NAME}-install-`) && !madeInstalls.has(e)),
    );
    expect(left).toEqual([]);
  });

  it('takes the install of a run that finished first when the rename fails', () => {
    const shared = join(BENCHMARKS, 'tmp', sharedInstallName(NAME, ['awilix']));
    rmSync(shared, { recursive: true, force: true });
    // The installer plays the other run: it puts a whole install in place
    // before this run's rename, so the rename fails and the catch path runs.
    const racing = (dir: string) => {
      mkdirSync(join(shared, 'node_modules'), { recursive: true });
      writeFileSync(join(shared, 'node_modules', 'winner'), 'x');
      mkdirSync(join(dir, 'node_modules'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'loser'), 'x');
    };
    const run = testConsumer(NAME, ['awilix'], racing);
    made.push(run);
    expect(existsSync(join(run, 'node_modules', 'winner'))).toBe(true);
    expect(existsSync(join(run, 'node_modules', 'loser'))).toBe(false);
    expect(
      readdirNames(join(BENCHMARKS, 'tmp')).filter((e) =>
        e.startsWith(`${NAME}-staging-`),
      ),
    ).toEqual([]);
  });

  it('removes what earlier runs left: other pins, old staging and run directories, the old cache', () => {
    const tmp = join(BENCHMARKS, 'tmp');
    const old = new Date(Date.now() - 2 * 3600 * 1000);
    const make = (name: string, aged: boolean) => {
      mkdirSync(join(tmp, name), { recursive: true });
      if (aged) utimesSync(join(tmp, name), old, old);
    };
    make(`${NAME}-install-000000000000`, false);
    make(`${NAME}-staging-old`, true);
    make(`${NAME}-staging-fresh`, false);
    make(`${NAME}-run-old`, true);
    make(`${NAME}-run-fresh`, false);
    make(NAME, false);
    const { install } = counting();
    made.push(testConsumer(NAME, ['awilix'], install));
    const left = new Set(readdirNames(tmp));
    expect(left.has(`${NAME}-install-000000000000`)).toBe(false);
    expect(left.has(`${NAME}-staging-old`)).toBe(false);
    expect(left.has(`${NAME}-run-old`)).toBe(false);
    expect(left.has(NAME)).toBe(false);
    expect(left.has(`${NAME}-staging-fresh`)).toBe(true);
    expect(left.has(`${NAME}-run-fresh`)).toBe(true);
    expect(left.has(sharedInstallName(NAME, ['awilix']))).toBe(true);
  });

  it('skips an entry another run deleted between the listing and the stat', () => {
    const tmp = join(BENCHMARKS, 'tmp');
    // A dangling link lists but cannot be stat'ed, as a directory removed
    // by a concurrent sweep would not.
    const gone = join(tmp, `${NAME}-run-gone`);
    rmSync(gone, { force: true });
    symlinkSync(join(tmp, 'does-not-exist'), gone);
    try {
      const { install } = counting();
      expect(() =>
        made.push(testConsumer(NAME, ['awilix'], install)),
      ).not.toThrow();
    } finally {
      rmSync(gone, { force: true });
    }
  });
});
