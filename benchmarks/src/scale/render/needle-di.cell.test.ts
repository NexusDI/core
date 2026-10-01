// A cell test: it installs needle-di at its pin, so it runs under the
// benchmarks check target (vitest.cells.config.ts), never under test.
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { readLibraries } from '../../libraries.ts';
import { scaleCell } from '../cells.ts';
import { SHAPES } from '../config.ts';
import { graphOf } from '../shapes.ts';
import { testConsumer } from '../test-consumer.ts';

describe('needle-di decorated scale cells', () => {
  const needle = readLibraries().libraries.find((l) => l.id === 'needle-di');
  if (needle === undefined) throw new Error('libraries.json lost needle-di');
  let dir = '';
  // Installs needle-di at its pin with the harness extras on first use.
  beforeAll(() => {
    dir = testConsumer('render-needle-di', ['needle-di']);
  }, 600_000);

  for (const shape of SHAPES)
    it(`passes ${shape} at n = 50 through compile, bundle and verify`, async () => {
      const result = await scaleCell(
        dir,
        needle,
        'decorated',
        graphOf(shape, 50),
      );
      expect(result.message).toBeUndefined();
      expect(result.outcome).toBe('pass');
      expect(readFileSync(result.bundle ?? '', 'utf8')).toMatch(
        /from ["']@needle-di\/core["']/,
      );
    }, 120_000);

  // A sync factory whose closure reaches an async provider through a class
  // throws unless it is bound async, but only when the factory is resolved
  // before that class. At n = 50 the verify order caches the classes
  // first; at n = 1,000 it does not.
  it('passes mixed-async at n = 1,000, with sync factories resolved before their async closure', async () => {
    const result = await scaleCell(
      dir,
      needle,
      'decorated',
      graphOf('mixed-async', 1000),
    );
    expect(result.message).toBeUndefined();
    expect(result.outcome).toBe('pass');
  }, 300_000);
});
