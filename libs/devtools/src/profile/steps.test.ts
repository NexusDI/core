import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { stepsOf } from './steps.js';

describe('stepsOf', () => {
  it('derives compile, static, build, init and setup from event spans', () => {
    const run = defined(
      report(
        [
          build({
            providerId: 'v',
            token: 'Config',
            startMs: 2,
            durationMs: 0,
            level: null,
            lifetime: null,
          }),
          build({ providerId: 'a', token: 'A', startMs: 3, durationMs: 4 }),
          build({
            providerId: 'b',
            token: 'B',
            startMs: 7,
            durationMs: 2,
            level: 1,
          }),
        ],
        [],
        {
          compile: {
            startMs: 0,
            durationMs: 2,
            modules: 1,
            providers: 3,
            errors: 0,
          },
          inits: [
            {
              providerId: 'b',
              token: 'B',
              level: 1,
              async: false,
              startMs: 9,
              syncMs: 1,
              awaitMs: null,
              durationMs: 1,
              failed: false,
            },
          ],
          durationMs: 12,
        },
      ).runs[0],
    );
    expect(stepsOf(run)).toEqual([
      { step: 'compile', startMs: 0, durationMs: 2 },
      { step: 'static', startMs: 2, durationMs: 0 },
      { step: 'build', startMs: 3, durationMs: 6 },
      { step: 'init', startMs: 9, durationMs: 1 },
      { step: 'setup', startMs: 10, durationMs: 2 },
    ]);
  });

  it('leaves out a step with no events, and setup while the run is open', () => {
    const run = defined(
      report(
        [build({ providerId: 'a', token: 'A', startMs: 1, durationMs: 1 })],
        [],
        {
          compile: null,
          ok: null,
          durationMs: null,
        },
      ).runs[0],
    );
    expect(stepsOf(run).map((s) => s.step)).toEqual(['build']);
  });
});
