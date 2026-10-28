import { fireEvent, screen } from '@testing-library/react';
import type { Scope } from '@nexusdi/core';
import type {
  AtmosphereReading,
  CompartmentId,
  ShipReading,
} from '@nexusdi/meridian-systems';
import type { NexusSetupStep } from '@nexusdi/vitest';
import { describe, expect, vi } from 'vitest';

import { BRIDGE_LINK, type CommandAnswer } from '../../app/di/contracts';
import { FailingSnapshotLink, FakeBridgeLink, shipAtStart } from '../doubles';
import {
  contextOf,
  test,
  withLink,
  type RenderRoute,
} from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const lifeSupport = await import('../../app/routes/systems/life-support');
const { action } = lifeSupport;

/**
 * Renders the page with its loader and action in a request scope, as React
 * Router runs them, and waits for the loader's data.
 */
async function renderPage(
  renderRoute: RenderRoute,
  overrides?: NexusSetupStep,
) {
  const page = await renderRoute(lifeSupport, {
    path: '/systems/life-support',
    overrides,
  });
  await screen.findByRole('button', { name: 'Bring life support online' });
  return page.scope;
}

/** The text of each gauge in the list `label` names, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/**
 * Seed 7 at tick 600, after `engineering throttle 0.01` and
 * `life-support online` at tick 0: the ship's own floats, and each analyzer's
 * reading of the same tick.
 */
const shipAt600: ShipReading = {
  ...shipAtStart,
  tick: 600,
  time: 300,
  compartments: {
    bridge: {
      moles: {
        O2: 523.7828070565887,
        N2: 1946.156037638721,
        CO2: 0.9168574221468165,
        H2O: 22.496040078621824,
        volatiles: 1.1661637269122016,
      },
      temperature: 292.78815948058684,
      pressure: 101204.28596604968,
    },
    habitat: {
      moles: {
        O2: 1047.5656141131774,
        N2: 3892.312075277442,
        CO2: 2.0581554567409577,
        H2O: 44.93152867138428,
        volatiles: 2.6425537860014763,
      },
      temperature: 292.7650957776126,
      pressure: 101205.93067046259,
    },
    'reactor-bay': {
      moles: {
        O2: 698.6201160754384,
        N2: 2594.8747168516284,
        CO2: 1.330704983000835,
        H2O: 29.940862117518787,
        volatiles: 1.9963574745013286,
      },
      temperature: 292.84183898279986,
      pressure: 101245.3275224233,
    },
    airlock: {
      moles: {
        O2: 104.79301741131576,
        N2: 389.23120752774423,
        CO2: 0.19960574745012527,
        H2O: 4.491129317627818,
        volatiles: 0.29970862117520164,
      },
      temperature: 292.42322343393,
      pressure: 101100.64963292163,
    },
  },
  reactor: {
    level: 0.01,
    thermal: 36_300_000,
    electric: 12_100_000,
    tripped: false,
  },
  coolant: { temperature: 506.6306816277174 },
  power: {
    output: 12_100_000,
    loads: [
      {
        id: 'life-support',
        priority: 1,
        demand: 6863.260786048409,
        allocated: 6863.260786048409,
      },
      { id: 'shields', priority: 2, demand: 0, allocated: 0 },
    ],
    shed: [],
  },
  lifeSupport: {
    heaters: { bridge: 2116.860228255746, habitat: 2346.4005577926628 },
  },
  setpoints: {
    ...shipAtStart.setpoints,
    reactor: { throttle: 0.01 },
    lifeSupport: { ...shipAtStart.setpoints.lifeSupport, online: true },
  },
};

const airAt600: Record<CompartmentId, AtmosphereReading<CompartmentId>> = {
  bridge: {
    compartment: 'bridge',
    tick: 600,
    temperature: 292.81,
    pressure: 101_217,
    partial: { O2: 21_253, N2: 78_958, CO2: 36, H2O: 910, volatiles: 42 },
  },
  habitat: {
    compartment: 'habitat',
    tick: 600,
    temperature: 292.76,
    pressure: 101_192,
    partial: { O2: 21_244, N2: 78_949, CO2: 39, H2O: 909, volatiles: 56 },
  },
  'reactor-bay': {
    compartment: 'reactor-bay',
    tick: 600,
    temperature: 292.89,
    pressure: 101_257,
    partial: { O2: 21_266, N2: 78_975, CO2: 37, H2O: 912, volatiles: 57 },
  },
  airlock: {
    compartment: 'airlock',
    tick: 600,
    temperature: 292.42,
    pressure: 101_119,
    partial: { O2: 21_231, N2: 78_854, CO2: 44, H2O: 911, volatiles: 64 },
  },
};

class LinkAt600 extends FakeBridgeLink {
  override async snapshot() {
    return shipAt600;
  }
  override async atmosphere(compartment: string) {
    return airAt600[compartment as CompartmentId];
  }
}

describe('the life-support gauges', () => {
  test("read each analyzer's air at tick 0", async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(await gauges('Habitat analyzer')).toEqual([
      '293.0 K',
      '101.3 kPa',
      '21.27 kPa',
      '0.04 kPa',
    ]);
    expect(await gauges('Habitat heater')).toEqual(['0 W']);
    expect(screen.getAllByText('Analyzer, tick 0')).toHaveLength(4);
  });

  test('read the air from the analyzers and the heaters from the snapshot at tick 600', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(LinkAt600));
    expect(await gauges('Bridge analyzer')).toEqual([
      '292.8 K',
      '101.2 kPa',
      '21.25 kPa',
      '0.04 kPa',
    ]);
    expect(await gauges('Habitat analyzer')).toEqual([
      '292.8 K',
      '101.2 kPa',
      '21.24 kPa',
      '0.04 kPa',
    ]);
    expect(await gauges('Reactor bay analyzer')).toEqual([
      '292.9 K',
      '101.3 kPa',
      '21.27 kPa',
      '0.04 kPa',
    ]);
    expect(await gauges('Airlock analyzer')).toEqual([
      '292.4 K',
      '101.1 kPa',
      '21.23 kPa',
      '0.04 kPa',
    ]);
    expect(await gauges('Bridge heater')).toEqual(['2,117 W']);
    expect(await gauges('Habitat heater')).toEqual(['2,346 W']);
    expect(screen.getAllByText('Ship snapshot, tick 600')).toHaveLength(2);
  });

  test('head each compartment and each form at the second level', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Bridge',
      'Habitat',
      'Reactor bay',
      'Airlock',
      'Life support',
      'Habitat thermostat',
      'Airlock pump and vent',
    ]);
  });

  test('show a heater only in the compartments that have one', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute);
    expect(screen.queryByLabelText('Reactor bay heater')).toBeNull();
    expect(screen.queryByLabelText('Airlock heater')).toBeNull();
  });

  test('say an analyzer is offline when its read fails, and keep the rest', async ({
    renderRoute,
  }) => {
    class AirlockDown extends FakeBridgeLink {
      override async atmosphere(compartment: string) {
        if (compartment === 'airlock') {
          throw new Error(
            'bridge-api answered 404 for /compartments/airlock/atmosphere',
          );
        }
        return super.atmosphere(compartment);
      }
    }
    await renderPage(renderRoute, withLink(AirlockDown));
    expect(await screen.findByText('Analyzer offline')).toBeDefined();
    expect(screen.queryByLabelText('Airlock analyzer')).toBeNull();
    expect((await gauges('Habitat analyzer'))[0]).toBe('293.0 K');
    expect(screen.getByRole('button', { name: 'Set pump' })).toBeDefined();
  });

  test('say the snapshot is offline when it fails, and keep the air and the forms', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(FailingSnapshotLink));
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('Habitat heater')).toBeNull();
    expect((await gauges('Habitat analyzer'))[0]).toBe('293.0 K');
    expect(
      screen.getByRole('button', { name: 'Set habitat target' }),
    ).toBeDefined();
  });
});

describe('the life-support forms', () => {
  /**
   * Clicks the button `name` and gives the command the page sent once the
   * last answer shows.
   */
  async function click(scope: Scope, name: string) {
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    fireEvent.click(screen.getByRole('button', { name }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(command).toHaveBeenCalledOnce();
    return command.mock.calls[0]?.[0];
  }

  test('bring life support online', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    expect(await click(scope, 'Bring life support online')).toStrictEqual({
      system: 'life-support',
      action: 'online',
    });
  });

  test('set the habitat heater target', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    fireEvent.change(screen.getByLabelText('Habitat heater target (K)'), {
      target: { value: '295.5' },
    });
    expect(await click(scope, 'Set habitat target')).toStrictEqual({
      system: 'life-support',
      action: 'heater',
      compartment: 'habitat',
      target: 295.5,
    });
  });

  test('set the airlock pump mode', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    fireEvent.change(screen.getByLabelText('Airlock pump mode'), {
      target: { value: 'evacuate' },
    });
    expect(await click(scope, 'Set pump')).toStrictEqual({
      system: 'life-support',
      action: 'pump',
      compartment: 'airlock',
      mode: 'evacuate',
    });
  });

  test('open the airlock vent', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    expect(await click(scope, 'Open vent')).toStrictEqual({
      system: 'life-support',
      action: 'vent',
      compartment: 'airlock',
      open: true,
    });
  });

  test('shut the airlock vent', async ({ renderRoute }) => {
    const scope = await renderPage(renderRoute);
    expect(await click(scope, 'Shut vent')).toStrictEqual({
      system: 'life-support',
      action: 'vent',
      compartment: 'airlock',
      open: false,
    });
  });

  test('show the refusal of a command and its fix', async ({ renderRoute }) => {
    class RefusingLink extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 400,
          code: 'MERIDIAN_BAD_COMMAND',
          message: 'life-support heater takes a target from 283 to 303 K.',
          fix: 'send a target from 283 to 303 K.',
        };
      }
    }
    await renderPage(renderRoute, withLink(RefusingLink));
    fireEvent.click(screen.getByRole('button', { name: 'Set habitat target' }));
    expect(
      await screen.findByText(
        'life-support heater takes a target from 283 to 303 K.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('Fix: send a target from 283 to 303 K.'),
    ).toBeDefined();
  });
});

describe('the life-support action', () => {
  /**
   * Runs the action on a POST of `fields`, as a crafted request would send
   * it, and gives the command it handed the scope's bridge link.
   */
  async function sent(scope: Scope, fields: Record<string, string>) {
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    const url = new URL('http://bridge/systems/life-support');
    const args: Parameters<typeof action>[0] = {
      request: new Request(url, {
        method: 'POST',
        body: new URLSearchParams(fields),
      }),
      url,
      pattern: '/systems/life-support',
      params: {},
      context: contextOf(scope),
    };
    await action(args);
    expect(command).toHaveBeenCalledOnce();
    return command.mock.calls[0]?.[0];
  }

  test('forwards a heater command with a blank target as sent', async ({
    openScope,
  }) => {
    const scope = await openScope();
    expect(
      await sent(scope, {
        command: 'heater',
        compartment: 'habitat',
        target: '',
      }),
    ).toStrictEqual({
      system: 'life-support',
      action: 'heater',
      compartment: 'habitat',
    });
  });

  test('forwards a vent command with no open as sent', async ({
    openScope,
  }) => {
    const scope = await openScope();
    expect(
      await sent(scope, { command: 'vent', compartment: 'airlock' }),
    ).toStrictEqual({
      system: 'life-support',
      action: 'vent',
      compartment: 'airlock',
    });
  });
});
