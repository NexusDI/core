// A cell test: it installs inversify at its pin, so it runs under the
// benchmarks check target (vitest.cells.config.ts), never under test.
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { readLibraries } from '../../libraries.ts';
import { scaleCell } from '../cells.ts';
import { SHAPES } from '../config.ts';
import { graphOf } from '../shapes.ts';
import { testConsumer } from '../test-consumer.ts';

describe('InversifyJS decorated scale cells', () => {
  const inversify = readLibraries().libraries.find((l) => l.id === 'inversify');
  if (inversify === undefined) throw new Error('libraries.json lost inversify');
  let dir = '';
  // Installs inversify at its pin with the harness extras on first use.
  beforeAll(() => {
    dir = testConsumer('render-inversify', ['inversify']);
  }, 600_000);

  for (const shape of SHAPES)
    it(`passes ${shape} at n = 50 through compile, bundle and verify`, async () => {
      const result = await scaleCell(
        dir,
        inversify,
        'decorated',
        graphOf(shape, 50),
      );
      expect(result.message).toBeUndefined();
      expect(result.outcome).toBe('pass');
      expect(readFileSync(result.bundle ?? '', 'utf8')).toMatch(
        /from ["']inversify["']/,
      );
    }, 120_000);

  // Aliases, factories and values across modules at a size where chains of
  // aliases and cross-module aliases occur.
  it('passes mixed at n = 200 through compile, bundle and verify', async () => {
    const result = await scaleCell(
      dir,
      inversify,
      'decorated',
      graphOf('mixed', 200),
    );
    expect(result.message).toBeUndefined();
    expect(result.outcome).toBe('pass');
  }, 180_000);
});
