import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { criticalPath } from './critical-path.js';

describe('criticalPath', () => {
  it('names a barrier: the level-1 provider depends on nothing in level 0', () => {
    // A is slow in level 0; B is fast; C in level 1 depends on B only.
    const r = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 10 }),
        build({ providerId: 'b', token: 'B', startMs: 0, durationMs: 1 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 10,
          durationMs: 2,
          level: 1,
        }),
      ],
      [['c', 'b']],
    );
    const path = defined(criticalPath(r, 0) ?? undefined);
    expect(path.path.map((p) => [p.token, p.dependsOnPrevious])).toEqual([
      ['A', false],
      ['C', false],
    ]);
    expect(path.buildMs).toBe(12);
    expect(path.boundMs).toBe(10);
    expect(path.barrierMs).toBe(2);
    expect(path.waits[0]).toMatchObject({ token: 'C', waitMs: 9 });
    expect(path.path[1]?.latestDep).toMatchObject({ token: 'B', earlierMs: 9 });
    expect(path.path[0]?.latestDep).toBeNull();
  });

  it('follows a dependency chain through a transient', () => {
    const r = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 3 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 3,
          durationMs: 2,
          level: 1,
        }),
      ],
      [
        ['c', 't'],
        ['t', 'a'],
      ],
    );
    const graph = defined(r.graph ?? undefined);
    const withTransient = {
      ...r,
      graph: {
        ...graph,
        providers: [
          ...graph.providers,
          {
            id: 't',
            token: 'T',
            module: 'Engineering',
            lifetime: 'transient',
            kind: 'factory',
            inline: true,
          },
        ],
      },
    };
    expect(
      defined(criticalPath(withTransient, 0) ?? undefined).path.map(
        (p) => p.dependsOnPrevious,
      ),
    ).toEqual([false, true]);
  });

  it('reports the late start of an async provider behind sync siblings', () => {
    const r = report([
      build({ providerId: 's', token: 'Sync', startMs: 0, durationMs: 4 }),
      build({
        providerId: 'n',
        token: 'NavCharts',
        startMs: 4,
        durationMs: 20,
        awaitMs: 19,
      }),
    ]);
    expect(defined(criticalPath(r, 0) ?? undefined).path[0]).toMatchObject({
      token: 'NavCharts',
      lateMs: 4,
    });
  });

  it('returns null with no graph, and an empty path for a run with no level builds', () => {
    expect(criticalPath({ ...report([]), graph: null }, 0)).toBeNull();
    expect(criticalPath(report([]), 0)).toMatchObject({
      buildMs: 0,
      boundMs: 0,
      barrierMs: 0,
      path: [],
      waits: [],
    });
  });
});
