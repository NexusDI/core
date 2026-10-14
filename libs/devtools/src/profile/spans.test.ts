import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { spansOf } from './spans.js';

const r = report(
  [
    build({
      providerId: 'r',
      token: 'ReactorCore',
      startMs: 1,
      durationMs: 1.2,
      syncMs: 0.9,
      finishMs: 0,
    }),
    build({
      providerId: 'n',
      token: 'NavCharts',
      startMs: 2.2,
      durationMs: 21.8,
      syncMs: 0.3,
      awaitMs: 21.4,
      finishMs: 0.1,
      level: 1,
    }),
  ],
  [['n', 'r']],
);

describe('spansOf', () => {
  it('draws one track per level with sync, await and finish children', () => {
    const spans = spansOf(defined(r.runs[0]), r.graph, r.reportedMs);
    const nav = spans.filter((s) => s.track === 'create · level 1');
    const tenth = (n: number) => Math.round(n * 10) / 10;
    expect(
      nav.map((s) => [s.name, tenth(s.startMs), tenth(s.endMs), s.color]),
    ).toEqual([
      ['NavCharts', 2.2, 24, 'primary-dark'],
      ['sync', 2.2, 2.5, 'primary-light'],
      ['await', 2.5, 23.9, 'secondary'],
      ['finish', 23.9, 24, 'tertiary-light'],
    ]);
    expect(defined(nav[0]).tooltip).toBe(
      'NavCharts 21.8 ms (0.3 sync, 21.4 await), critical path',
    );
  });

  it('draws the run, its steps and a ready marker', () => {
    const spans = spansOf(defined(r.runs[0]), r.graph, r.reportedMs);
    expect(
      spans.filter((s) => s.track === 'Runs' && !s.marker).map((s) => s.name),
    ).toEqual(['create']);
    expect(spans.filter((s) => s.marker).map((s) => s.name)).toEqual([
      'create ready',
    ]);
    expect(spans.some((s) => s.track === 'Steps' && s.name === 'build')).toBe(
      true,
    );
  });

  it('draws a pending build to the report time in the error colour', () => {
    const open = report([], [], {
      ok: null,
      durationMs: null,
      pending: [
        {
          providerId: 'n',
          token: 'NavCharts',
          module: 'Tactical',
          level: 0,
          what: 'construct',
          startMs: 5,
          syncMs: 0.2,
        },
      ],
    });
    const pending = spansOf(defined(open.runs[0]), open.graph, 60_005).find(
      (s) => s.name === 'NavCharts',
    );
    expect(pending).toMatchObject({
      startMs: 5,
      endMs: 60_005,
      color: 'error',
      tooltip: 'NavCharts still awaiting at timeout',
    });
  });
  it('draws a failed build and its run in the error colour', () => {
    const failed = report(
      [
        build({
          providerId: 'b',
          token: 'Breach',
          startMs: 0,
          durationMs: 1,
          failed: true,
          syncMs: null,
          finishMs: null,
        }),
      ],
      [],
      { ok: false },
    );
    const spans = spansOf(defined(failed.runs[0]), failed.graph, 2);
    expect(spans.find((s) => s.name === 'Breach')).toMatchObject({
      color: 'error',
      tooltip: 'Breach 1.0 ms, failed',
    });
    expect(spans.filter((s) => s.marker)).toMatchObject([
      { name: 'create failed', color: 'error' },
    ]);
  });

  it("draws onInit calls and a pending onInit on the run's onInit track", () => {
    const open = report([], [], {
      ok: null,
      durationMs: null,
      inits: [
        {
          providerId: 'r',
          token: 'Reactor',
          level: 0,
          async: false,
          startMs: 1,
          syncMs: 1,
          awaitMs: null,
          durationMs: 1,
          failed: false,
        },
      ],
      pending: [
        {
          providerId: 'c',
          token: 'Computer',
          module: 'Engineering',
          level: 0,
          what: 'init',
          startMs: 2,
          syncMs: 0,
        },
      ],
    });
    const spans = spansOf(defined(open.runs[0]), open.graph, 10);
    expect(
      spans
        .filter((s) => s.track === 'create · onInit')
        .map((s) => [s.name, s.color]),
    ).toEqual([
      ['Reactor', 'primary'],
      ['Computer', 'error'],
    ]);
  });
});
