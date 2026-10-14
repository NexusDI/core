import { describe, expect, it } from 'vitest';

import { build, report } from '../../test-support/profile-fixture.js';
import { profileTable } from './table.js';

const meridian = report(
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
      module: 'Tactical',
      startMs: 2.2,
      durationMs: 21.8,
      awaitMs: 21.4,
      syncMs: 0.3,
      finishMs: 0.1,
      level: 1,
    }),
  ],
  [['n', 'r']],
);

// A barrier on a sibling of the previous member (C), one with no dependency
// built in the run (F), and an async member that starts late behind a sync
// sibling (G).
const fleet = report(
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
    build({
      providerId: 'f',
      token: 'F',
      startMs: 12,
      durationMs: 1,
      level: 2,
    }),
    build({
      providerId: 'h',
      token: 'H',
      startMs: 13,
      durationMs: 0.5,
      level: 3,
    }),
    build({
      providerId: 'g',
      token: 'G',
      startMs: 13.5,
      durationMs: 5,
      awaitMs: 4.5,
      level: 3,
    }),
  ],
  [
    ['c', 'b'],
    ['g', 'f'],
  ],
);

describe('profileTable', () => {
  it('prints the steps, the slowest providers, the levels and the critical path', () => {
    const text = profileTable(meridian);
    expect(text.split('\n')[0]).toBe('create 25.0 ms, cold');
    expect(text).toContain('slowest providers');
    expect(text).toMatch(
      /NavCharts\s+Tactical\s+1\s+singleton\s+0\.3\s+21\.4\s+0\.1\s+21\.8\s+0\.0\s+async/,
    );
    expect(text).toMatch(
      /ReactorCore\s+Engineering\s+0\s+singleton\s+0\.9\s+-\s+0\.0\s+0\.9\s+0\.3/,
    );
    expect(text).toContain('critical path');
  });

  it('pins the steps, levels and critical path of the meridian fixture', () => {
    const text = profileTable(meridian);
    expect(text).toMatch(
      /^build\s+23\.0\s+95\.8%\s+2 levels, 2 providers, 1 async$/m,
    );
    expect(text).toMatch(/^\s*0\s+1\s+1\.2\s+ReactorCore 0\.9$/m);
    expect(text).toMatch(/^\s*1\s+1\s+21\.8\s+NavCharts 21\.8$/m);
    expect(text).toContain(
      'critical path, build 23.0 ms: dependency bound 22.7 ms, level barriers 0.3 ms',
    );
    expect(text).toMatch(
      /^level 1\s+NavCharts\s+21\.8 ms\s+depends on ReactorCore$/m,
    );
  });

  it("names a barrier's latest dependency, or says the run built none", () => {
    const text = profileTable(fleet);
    expect(text).toMatch(
      /^level 1\s+C\s+2\.0 ms\s+barrier: depends on B, which ended 9\.0 ms earlier$/m,
    );
    expect(text).toMatch(
      /^level 2\s+F\s+1\.0 ms\s+barrier: no dependency built in this run$/m,
    );
    expect(text).toMatch(
      /^level 3\s+G\s+5\.0 ms\s+depends on F; started 0\.5 ms late, behind sync siblings$/m,
    );
    const waits = text.slice(text.indexOf('barrier waits'));
    expect(
      waits
        .split('\n')
        .slice(1, 5)
        .map((line) => line.split(/\s+/).slice(0, 2).join(' ')),
    ).toEqual(['H 13.0', 'F 12.0', 'C 9.0', 'G 0.5']);
  });

  it('limits the provider rows to top', () => {
    expect(profileTable(meridian, { top: 1 })).not.toMatch(/^ReactorCore/m);
  });

  it('shows the cold run and warm medians for several reports', () => {
    const text = profileTable([meridian, meridian, meridian]);
    expect(text.split('\n')[0]).toBe(
      'create 25.0 ms, cold; 2 warm, median 25.0 ms',
    );
  });

  it('marks a failed provider and lists what an open run still awaits', () => {
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
    expect(profileTable(failed)).toMatch(/Breach.*failed/);
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
          startMs: 0,
          syncMs: 0.2,
        },
      ],
    });
    expect(profileTable(open)).toContain(
      'still awaiting: NavCharts (Tactical) factory',
    );
  });

  it('renders an empty run and an all-zero run without NaN or Infinity', () => {
    for (const r of [
      report([]),
      report(
        [build({ providerId: 'z', token: 'Zero', startMs: 0, durationMs: 0 })],
        [],
        { durationMs: 0 },
      ),
    ]) {
      const text = profileTable(r);
      expect(text).not.toMatch(/NaN|Infinity/);
    }
  });
});
