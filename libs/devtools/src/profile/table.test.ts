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

describe('profileTable', () => {
  it('prints the steps, the slowest providers, the levels and the critical path', () => {
    const text = profileTable(meridian);
    expect(text.split('\n')[0]).toBe('create 25.0 ms');
    expect(text).toContain('slowest providers');
    expect(text).toMatch(
      /NavCharts\s+Tactical\s+1\s+singleton\s+0\.3\s+21\.4\s+0\.1\s+21\.8\s+0\.0\s+async/,
    );
    expect(text).toMatch(
      /ReactorCore\s+Engineering\s+0\s+singleton\s+0\.9\s+-\s+0\.0\s+0\.9\s+0\.3/,
    );
    expect(text).toContain('critical path');
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
