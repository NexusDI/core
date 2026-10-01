// A cell test: it installs tsyringe at its pin, so it runs under the
// benchmarks check target (vitest.cells.config.ts), never under test.
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { readLibraries } from '../../libraries.ts';
import { scaleCell } from '../cells.ts';
import { SHAPES } from '../config.ts';
import { graphOf } from '../shapes.ts';
import { testConsumer } from '../test-consumer.ts';

describe('tsyringe decorated scale cells', () => {
  const tsyringe = readLibraries().libraries.find((l) => l.id === 'tsyringe');
  if (tsyringe === undefined) throw new Error('libraries.json lost tsyringe');
  let dir = '';
  // Installs tsyringe at its pin with the harness extras on first use.
  beforeAll(() => {
    dir = testConsumer('render-tsyringe', ['tsyringe']);
  }, 600_000);

  for (const shape of SHAPES.filter((s) => s !== 'mixed-async'))
    it(`passes ${shape} at n = 50 through compile, bundle and verify`, async () => {
      const result = await scaleCell(
        dir,
        tsyringe,
        'decorated',
        graphOf(shape, 50),
      );
      expect(result.message).toBeUndefined();
      expect(result.outcome).toBe('pass');
      expect(readFileSync(result.bundle ?? '', 'utf8')).toMatch(
        /from ["']tsyringe["']/,
      );
    }, 120_000);

  it('records mixed-async as not-applicable with the libraries.json reason', async () => {
    const result = await scaleCell(
      dir,
      tsyringe,
      'decorated',
      graphOf('mixed-async', 50),
    );
    expect(result).toEqual({
      outcome: 'not-applicable',
      message: tsyringe.notApplicable['async-factory'],
    });
  });
});
