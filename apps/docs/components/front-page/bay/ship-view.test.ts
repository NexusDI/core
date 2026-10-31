import { describe, expect, it } from 'vitest';

import { readFixtures } from './fixtures';
import { check } from './run';
import { darkPower } from './power';
import { shipView } from './ship-view';
import { SEED_STATE, type BayState } from './state';

function view(state: BayState, errors = true) {
  return shipView({
    state,
    power: darkPower(state),
    check: check(state, errors),
    startupError: null,
    lookupError: null,
    online: [],
    linked: null,
  });
}

const state = (id: string) => {
  const found = readFixtures().find((each) => each.id === id);
  if (!found) throw new Error(id);
  return found.state;
};

describe('the ship view of a failed check', () => {
  it('draws a cut conduit as broken, with an empty socket at the requester and an alarm room', () => {
    const v = view(state('cut-comms'));
    expect(v.conduits['Tactical>Comms']).toBe('broken');
    expect(v.sockets.map((socket) => socket.token)).toEqual(['SubspaceLink']);
    expect(v.light.rooms['chart-room']).toBe('alarm');
    expect(v.light.rooms['bridge']).toBe('unpowered');
    expect(v.callouts.map((callout) => callout.title)).toContain('Link lost');
    expect(v.banner).toMatchObject({
      code: 'NEXUS_MISSING_PROVIDER',
      subject: 'Tactical',
      count: 1,
      fixes: [{ kind: 'import', conduit: 'Tactical>Comms' }],
    });
    expect(v.banner?.line).toBe(
      'NavCharts (provider) in Tactical (module) cannot reach SubspaceLink. Launch is locked.',
    );
  });

  it('counts three entries for the offline drill and offers no fix', () => {
    const v = view(state('offline-computer'));
    expect(v.banner?.count).toBe(3);
    expect(v.banner?.code).toBe('NEXUS_INVALID_EXPORT');
    expect(v.banner?.fixes).toEqual([]);
    expect(v.systems.ShipComputer).toBe('offline');
    expect(v.hatches.ShipComputer).toBe('alarm');
    expect(v.sockets.map((socket) => socket.token)).toEqual([
      'ShipComputer',
      'ShipComputer',
    ]);
    expect(v.notes.map((note) => note.text)).toContain(
      'Removed from Engineering',
    );
  });

  it('closes the hatch and names the export fix for the hatch drill', () => {
    const v = view(state('hatch-computer'));
    expect(v.hatches.ShipComputer).toBe('closed');
    expect(v.light.doors['bridge-computer-core']).toBe('closed');
    expect(v.banner?.count).toBe(2);
    expect(v.banner?.fixes[0]).toEqual({
      kind: 'export',
      hatch: 'ShipComputer',
    });
  });

  it('draws a cut with no error as a plain gap, and no banner', () => {
    const cut = {
      ...SEED_STATE,
      conduits: { ...SEED_STATE.conduits, 'Meridian>BridgeApi': false },
    };
    const v = view(cut);
    expect(v.conduits['Meridian>BridgeApi']).toBe('cut');
    expect(v.banner).toBeNull();
  });

  it('offers no fix without errors(), since core alone names no near miss', () => {
    expect(view(state('cut-comms'), false).banner?.fixes).toEqual([]);
  });

  it('passes the seed with no banner and every conduit intact', () => {
    const v = view(SEED_STATE);
    expect(v.banner).toBeNull();
    expect(
      Object.values(v.conduits).every((status) => status === 'intact'),
    ).toBe(true);
  });
});

describe('the ship view after a launch', () => {
  it('banners a lookup the check cannot see and alarms the bridge', () => {
    const closed = state('hatch-drone');
    const v = shipView({
      state: closed,
      power: darkPower(closed),
      check: { ok: true, error: null },
      startupError: null,
      lookupError: {
        kind: 'not-visible',
        code: 'NEXUS_NOT_VISIBLE',
        fields: { token: 'SurveyDrone', owners: ['Tactical'] },
        message: '',
      },
      online: [],
      linked: null,
    });
    expect(v.banner).toMatchObject({
      code: 'NEXUS_NOT_VISIBLE',
      subject: 'Meridian',
    });
    expect(v.light.rooms['bridge']).toBe('alarm');
    expect(v.hatches.SurveyDrone).toBe('closed');
  });

  it('banners a failed startup with its cause and alarms the failed room', () => {
    const down = state('chart-server-down');
    const v = shipView({
      state: down,
      power: darkPower(down),
      check: { ok: true, error: null },
      startupError: {
        kind: 'provider-failed',
        code: 'NEXUS_PROVIDER_FAILED',
        fields: { token: 'NavCharts', module: 'Tactical' },
        message: '',
        cause: { message: 'chart server unreachable' },
      },
      lookupError: null,
      online: [],
      linked: null,
    });
    expect(v.light.rooms['chart-room']).toBe('alarm');
    expect(v.chartServer).toBe('failed');
    expect(v.banner?.line).toBe(
      'NavCharts (provider) failed at startup: chart server unreachable.',
    );
  });
});
