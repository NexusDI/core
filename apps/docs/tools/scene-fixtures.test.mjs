import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SEED } from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it } from 'vitest';

import { DRILLS, fixtureOf, modulesOf, zeroMs } from './scene-fixtures.mjs';

const dir = join(
  import.meta.dirname,
  '..',
  'components',
  'front-page',
  'fixtures',
);
const read = (id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
const codes = (fixture) =>
  fixture.check.withErrors.error.entries.map((each) => each.code);

/** Every key under `value` that ends in Ms, with its value. */
function msFields(value, found = []) {
  if (Array.isArray(value)) value.forEach((each) => msFields(each, found));
  else if (value !== null && typeof value === 'object')
    for (const [key, each] of Object.entries(value)) {
      if (key.endsWith('Ms')) found.push(each);
      else msFields(each, found);
    }
  return found;
}

describe('zeroMs', () => {
  it('zeroes each number under a key ending in Ms and keeps a null', () => {
    expect(
      zeroMs({
        type: 'run',
        startMs: 4.2,
        awaitMs: null,
        nested: [{ syncMs: 1 }],
        level: 2,
      }),
    ).toEqual({
      type: 'run',
      startMs: 0,
      awaitMs: null,
      nested: [{ syncMs: 0 }],
      level: 2,
    });
  });
});

describe('the scene fixtures', () => {
  it('writes one file per drill, and a rerun writes the same bytes', async () => {
    for (const drill of DRILLS) {
      const again = JSON.parse(JSON.stringify(await fixtureOf(drill)));
      expect(again).toEqual(read(drill.id));
    }
  });

  it('lists the modules of the seed with the tokens each exports', () => {
    const modules = modulesOf(SEED);
    expect(modules.map((each) => each.name)).toEqual([
      'Meridian',
      'Engineering',
      'Comms',
      'Tactical',
      'BridgeApi',
    ]);
    expect(modules.find((each) => each.name === 'Tactical')?.exports).toEqual([
      'NavCharts',
      'SurveyDrone',
    ]);
  });

  it('holds no time in any trace event', () => {
    for (const drill of DRILLS) {
      const fixture = read(drill.id);
      const times = msFields(fixture.launch);
      expect(times.filter((each) => each !== 0 && each !== null)).toEqual([]);
    }
  });

  it('passes the check on the seed and launches it in three levels', () => {
    const seed = read('seed');
    expect(seed.check.withErrors.ok).toBe(true);
    expect(seed.terminal.check).toBe(
      '$ npm run preflight\npre-flight ok\nexit 0',
    );
    const built = seed.launch.trace.filter((each) => each.type === 'construct');
    const level = (n) =>
      built.filter((each) => each.level === n).map((each) => each.token);
    expect(level(0)).toEqual(['ReactorCore', 'SubspaceLink']);
    expect(level(1)).toEqual(['ShipComputer', 'NavCharts']);
    expect(level(2)).toEqual(['DiagnosticsPanel']);
    expect(seed.launch.trace.at(-1)).toMatchObject({ type: 'run', ok: true });
    expect(seed.launch.readout).toBe('laser 1420: course to Kepler-442b');
  });

  it('builds one SubspaceLink on the seed', () => {
    const built = read('seed').launch.trace.filter(
      (each) => each.type === 'construct' && each.token === 'SubspaceLink',
    );
    expect(built).toHaveLength(1);
  });

  it('starts the async chart factory and disposes newest first', () => {
    const seed = read('seed');
    expect(
      seed.launch.trace
        .filter((each) => each.type === 'construct:await')
        .map((e) => e.token),
    ).toEqual(['NavCharts']);
    expect(seed.launch.disposal.map((each) => [each.type, each.token])).toEqual(
      [
        ['dispose:instance', 'SubspaceLink'],
        ['dispose:instance', 'ReactorCore'],
        ['dispose', undefined],
      ],
    );
    expect(seed.launch.shutdown).toEqual([
      'subspace link closed',
      'reactor scram: control rods dropped',
    ]);
  });

  it('names the Comms import in the near miss of the cut conduit', () => {
    const fixture = read('cut-comms');
    expect(codes(fixture)).toEqual(['NEXUS_MISSING_PROVIDER']);
    expect(fixture.check.withErrors.error.entries[0].fields).toEqual({
      token: 'SubspaceLink',
      requester: 'NavCharts',
      module: 'Tactical',
      entry: null,
      nearMisses: [{ kind: 'not-imported', module: 'Comms' }],
    });
    expect(fixture.launch).toBeNull();
  });

  it('names the Engineering import for the second conduit', () => {
    const entry = read('cut-engineering').check.withErrors.error.entries[0];
    expect(entry.fields).toMatchObject({
      token: 'ShipComputer',
      requester: 'SurveyDrone',
      module: 'Tactical',
      nearMisses: [{ kind: 'not-imported', module: 'Engineering' }],
    });
  });

  it('lists both errors in one BlueprintError when both conduits are cut', () => {
    const fixture = read('cut-both');
    expect(fixture.check.withErrors.error.code).toBe('NEXUS_BLUEPRINT_INVALID');
    expect(codes(fixture)).toEqual([
      'NEXUS_MISSING_PROVIDER',
      'NEXUS_MISSING_PROVIDER',
    ]);
  });

  it('gives an invalid export and two missing providers when the computer goes offline', () => {
    const fixture = read('offline-computer');
    expect(codes(fixture)).toEqual([
      'NEXUS_INVALID_EXPORT',
      'NEXUS_MISSING_PROVIDER',
      'NEXUS_MISSING_PROVIDER',
    ]);
    const [exported, ...missing] = fixture.check.withErrors.error.entries;
    expect(exported.fields).toEqual({
      token: 'ShipComputer',
      module: 'Engineering',
    });
    expect(
      missing.map((each) => [each.fields.requester, each.fields.module]),
    ).toEqual([
      ['DiagnosticsPanel', 'Meridian'],
      ['SurveyDrone', 'Tactical'],
    ]);
    expect(missing.map((each) => each.fields.nearMisses)).toEqual([[], []]);
  });

  it('names the closed hatch in the near miss', () => {
    const fixture = read('hatch-computer');
    expect(codes(fixture)).toEqual([
      'NEXUS_MISSING_PROVIDER',
      'NEXUS_MISSING_PROVIDER',
    ]);
    for (const entry of fixture.check.withErrors.error.entries)
      expect(entry.fields.nearMisses).toEqual([
        { kind: 'not-exported', module: 'Engineering' },
      ]);
    expect(
      fixture.check.withErrors.error.entries.map((e) => e.fields.module),
    ).toEqual(['Meridian', 'Tactical']);
  });

  it('passes the check with the drone hatch closed and refuses the root lookup', () => {
    const fixture = read('hatch-drone');
    expect(fixture.check.withErrors.ok).toBe(true);
    expect(fixture.launch.ok).toBe(true);
    expect(fixture.launch.lookup.has).toBe(false);
    expect(fixture.launch.lookup.error.code).toBe('NEXUS_NOT_VISIBLE');
    expect(fixture.launch.lookup.error.fields).toMatchObject({
      token: 'SurveyDrone',
      owners: ['Tactical'],
    });
  });

  it('fails the launch with the factory error as the cause and rolls back newest first', () => {
    const fixture = read('chart-server-down');
    expect(fixture.check.withErrors.ok).toBe(true);
    expect(fixture.launch.ok).toBe(false);
    expect(fixture.launch.error.code).toBe('NEXUS_PROVIDER_FAILED');
    expect(fixture.launch.error.fields).toMatchObject({
      token: 'NavCharts',
      module: 'Tactical',
    });
    expect(fixture.launch.error.cause.message).toBe('chart server unreachable');
    const after = fixture.launch.trace.map((each) => [each.type, each.token]);
    const failed = after.findIndex(([type]) => type === 'construct:failed');
    expect(after.slice(failed)).toEqual([
      ['construct:failed', 'NavCharts'],
      ['dispose:instance', 'SubspaceLink'],
      ['dispose:instance', 'ReactorCore'],
      ['run', undefined],
    ]);
    expect(fixture.launch.trace.at(-1)).toMatchObject({
      type: 'run',
      ok: false,
    });
  });

  it("prints core's own line when errors() is off, and the sentences when it is on", () => {
    const fixture = read('cut-comms');
    expect(fixture.check.plain.error.message).toContain(
      '[NEXUS_MISSING_PROVIDER] token=SubspaceLink requester=NavCharts module=Tactical.',
    );
    expect(fixture.check.plain.error.message).not.toContain('Fix:');
    expect(fixture.check.withErrors.error.message).toContain(
      'Fix: import Comms into Tactical.',
    );
    expect(fixture.terminal.check).toContain(
      fixture.check.withErrors.error.message,
    );
    expect(fixture.terminal.checkPlain).toContain(
      fixture.check.plain.error.message,
    );
  });
});
