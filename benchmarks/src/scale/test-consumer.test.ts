import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { BENCHMARKS } from '../libraries.ts';
import { testConsumer } from './test-consumer.ts';

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
});
