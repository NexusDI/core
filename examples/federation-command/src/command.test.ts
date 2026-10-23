import { Nexus, defineModule, isNexusError, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  type ICommandLink,
  type INavCharts,
  type StationCommand,
} from '@nexusdi/federation-contracts';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it } from 'vitest';

import { BRIDGE, Bridge } from './bridge';
import { Command } from './command.module';
import { HELM_ORDERS, HelmOrders } from './helm-orders';

const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

/** The commands the fake link was sent, in order. */
const sent: StationCommand[] = [];
const fakeLink: ICommandLink = {
  send: async (command) => {
    sent.push(command);
    return { queued: true, tick: sent.length, text: 'queued' };
  },
};

/**
 * What the shell's Tactical gives a loaded remote: a global NAV_CHARTS and
 * a global COMMAND_LINK.
 */
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useValue: fakeCharts }),
    provide(COMMAND_LINK, { useValue: fakeLink }),
  ],
  exports: [NAV_CHARTS, COMMAND_LINK],
  global: true,
});

const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, Command],
});

describe('Command', () => {
  it('builds Bridge, whose @Inject accessor reads the contract charts', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const bridge = ship.get(BRIDGE);
    expect(bridge).toBeInstanceOf(Bridge);
    expect(bridge.course('Kepler-442b')).toBe(
      'course to Kepler-442b, heading 42',
    );
  });

  it('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: [federation()] }),
    ).not.toThrow();
  });

  it('builds HelmOrders through @Injectable and sends helm orders over COMMAND_LINK', async () => {
    sent.length = 0;
    await using ship = await createTestingContainer(Meridian).create();
    const helm = ship.get(HELM_ORDERS);
    expect(helm).toBeInstanceOf(HelmOrders);
    expect(await helm.course('Kepler-442b')).toEqual({
      queued: true,
      tick: 1,
      text: 'queued',
    });
    await helm.burn(0.5);
    expect(sent).toEqual([
      { system: 'helm', action: 'course', to: 'Kepler-442b' },
      { system: 'helm', action: 'burn', level: 0.5 },
    ]);
  });

  it('fails Nexus.check with NEXUS_MISSING_PROVIDER when no COMMAND_LINK is provided', () => {
    const ChartsOnly = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
      exports: [NAV_CHARTS],
      global: true,
    });
    const root = defineModule({
      name: 'Meridian',
      imports: [ChartsOnly, Command],
    });
    let errors: unknown[] = [];
    try {
      Nexus.check(root, { plugins: [federation()] });
    } catch (error) {
      errors = (error as { errors: unknown[] }).errors;
    }
    expect(errors).toHaveLength(1);
    expect(isNexusError(errors[0], 'NEXUS_MISSING_PROVIDER')).toBe(true);
    expect(String(errors[0])).toContain('meridian/CommandLink');
  });
});
