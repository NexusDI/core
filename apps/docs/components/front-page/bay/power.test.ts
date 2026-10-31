import type { TraceEvent } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { readFixtures } from './fixtures';
import {
  applyEvent,
  darkPower,
  levelLines,
  poweredRooms,
  powerAfter,
} from './power';
import { SEED_STATE } from './state';

const fixture = (id: string) => {
  const found = readFixtures().find((each) => each.id === id);
  if (!found?.launch) throw new Error(`no launch fixture ${id}`);
  return { state: found.state, events: found.launch.trace };
};

describe('the power-up reducer', () => {
  it('lights the hull sections whose singletons are all nominal', () => {
    const { state, events } = fixture('seed');
    const power = powerAfter(state, events);
    expect(power.systems.ReactorCore).toBe('nominal');
    expect(power.systems.NavCharts).toBe('nominal');
    expect(power.systems.SurveyDrone).toBe('standby');
    expect(power.systems.FlightLog).toBe('standby');
    expect([...poweredRooms(state, power)].sort()).toEqual([
      'bridge',
      'chart-room',
      'comms-relay',
      'computer-core',
      'engineering',
      'reactor-bay',
    ]);
  });

  it('keeps every room dark before an event, and builds none from a check', () => {
    expect(poweredRooms(SEED_STATE, darkPower(SEED_STATE)).size).toBe(0);
  });

  it('holds NavCharts active from its await to its construct', () => {
    const { state, events } = fixture('seed');
    const at = events.findIndex((event) => event.type === 'construct:await');
    const during = powerAfter(state, events.slice(0, at + 1));
    expect(during.systems.NavCharts).toBe('active');
    expect(poweredRooms(state, during).has('chart-room')).toBe(false);
  });

  it('dims the ship in reverse as dispose:instance events arrive after a failed startup', () => {
    const { state, events } = fixture('chart-server-down');
    const dims = events.filter((event) => event.type === 'dispose:instance');
    expect(
      dims.map((event) => ('token' in event ? event.token : null)),
    ).toEqual(['SubspaceLink', 'ReactorCore']);
    const failed = powerAfter(
      state,
      events.slice(
        0,
        events.findIndex((e) => e.type === 'dispose:instance'),
      ),
    );
    expect(failed.systems.NavCharts).toBe('alarm');
    expect(failed.systems.SubspaceLink).toBe('nominal');
    const end = powerAfter(state, events);
    expect(end.systems.SubspaceLink).toBe('idle');
    expect(end.systems.ReactorCore).toBe('idle');
    expect(poweredRooms(state, end).size).toBe(0);
  });

  it('ignores an event type it does not know (P2)', () => {
    const power = darkPower(SEED_STATE);
    const unknown = {
      type: 'future:event',
      token: 'ReactorCore',
    } as unknown as TraceEvent;
    expect(applyEvent(power, unknown)).toBe(power);
  });

  it('writes "Level N." lines from the events, numbered from the level plus one', () => {
    const { events } = fixture('seed');
    expect(levelLines(events).map((line) => line.text)).toEqual([
      'Level 1. Reactor and subspace link online.',
      'Level 2. Ship computer and nav charts online.',
      'Level 3. Diagnostics panel online.',
    ]);
  });
});
