import { defineModule, provide } from '@nexusdi/core';
import {
  ALARM_SINKS,
  ATMOSPHERE_PROBE,
  COMPARTMENT_IDS,
  MASTER_ALARM,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { nexusTest } from '@nexusdi/vitest';
import { describe, expect, test as base } from 'vitest';

import { createBridge } from '../src/hono';
import { AUDIT_LOG } from '../src/ship/audit-trail.module';
import { SIM_DRIVER } from '../src/ship/contracts';
import { OfflineMeridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';
import { FailingProbe, MemoryAlarmSink } from './doubles';

/**
 * Global, as AlarmPanel is: all(ALARM_SINKS) in Safety reads the sinks of
 * Safety and its imports, and the exports of every global module.
 */
const MemoryAlarms = defineModule({
  name: 'MemoryAlarms',
  global: true,
  providers: [provide(ALARM_SINKS, { useClass: MemoryAlarmSink })],
  exports: [ALARM_SINKS],
});

const AlarmTestShip = defineModule({
  name: 'AlarmTestShip',
  imports: [OfflineMeridian, MemoryAlarms],
});

const test = nexusTest(base, AlarmTestShip, {
  create: { plugins: bridgePlugins() },
});

/**
 * SIM_DRIVER and AUDIT_LOG resolve from inside OfflineMeridian, which
 * exports nothing. Each lookup passes the module, so they all read alike.
 */
const inShip = { module: OfflineMeridian };

const faults = COMPARTMENT_IDS.map((subject) => ({
  code: 'SENSOR_FAULT',
  subject,
}));

describe('the alarm panel with a failing probe', () => {
  test.override('nexusSetup', [
    (builder) => builder.override(ATMOSPHERE_PROBE, { useClass: FailingProbe }),
  ]);

  test('raises SENSOR_FAULT for each compartment once and clears none', ({
    nexus,
  }) => {
    nexus.get(SIM_DRIVER, inShip).advance(10);
    const sink = nexus
      .get(ALARM_SINKS, inShip)
      .find((entry) => entry instanceof MemoryAlarmSink);
    expect(sink?.heard).toEqual(
      faults.map((alarm) => ({ call: 'raise', alarm, tick: 1 })),
    );
  });

  test('writes each raise to the audit log', ({ nexus }) => {
    nexus.get(SIM_DRIVER, inShip).advance(10);
    expect(nexus.get(AUDIT_LOG, inShip).calls).toEqual(
      COMPARTMENT_IDS.map((room) => `raised SENSOR_FAULT ${room} at tick 1`),
    );
  });

  test('holds the four faults as the active alarms', ({ nexus }) => {
    nexus.get(SIM_DRIVER, inShip).advance(10);
    expect(nexus.get(MASTER_ALARM, inShip).active()).toEqual(faults);
  });
});

test('a probe that throws answers an empty 500 for an atmosphere read', async () => {
  // The bridge resolves from the root, so this ship is OfflineMeridian itself.
  await using ship = await createTestingContainer(OfflineMeridian)
    .override(ATMOSPHERE_PROBE, { useClass: FailingProbe })
    .create();
  const res = await createBridge(ship).request(
    '/compartments/habitat/atmosphere',
  );
  expect(res.status).toBe(500);
  expect(await res.text()).toBe('');
});
