import { fireEvent, screen } from '@testing-library/react';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';
import type { NexusSetupStep } from '@nexusdi/vitest';
import { Form, useActionData } from 'react-router';
import { describe, expect, vi } from 'vitest';

import { BRIDGE_LINK, type CommandAnswer } from '../../app/di/contracts';
import {
  FailingSnapshotLink,
  FakeBridgeLink,
  linkAt,
  shipAtStart,
} from '../doubles';
import { test, withLink, type RenderRoute } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const ftl = await import('../../app/routes/systems/ftl');

/**
 * Renders the page with its loader and action in a request scope, as React
 * Router runs them, and waits for the loader's data.
 */
async function renderPage(
  renderRoute: RenderRoute,
  overrides?: NexusSetupStep,
) {
  const page = await renderRoute(ftl, { path: '/systems/ftl', overrides });
  await screen.findByRole('button', { name: 'Spool drive' });
  return page.scope;
}

/** The text of each gauge in the list named `label`, in order. */
async function gauges(label: string) {
  const list = await screen.findByLabelText(label);
  return [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
}

/**
 * The power record with the FTL spool's load, which asks `demand` and is
 * granted `allocated`.
 */
function spoolLoad(
  demand: number,
  allocated: number,
  shed: string[] = [],
): ShipReading['power'] {
  return {
    ...shipAtStart.power,
    loads: [
      ...shipAtStart.power.loads,
      { id: 'ftl-spool', priority: 7, demand, allocated },
    ],
    shed,
  };
}

/** The setpoints with the drive armed. */
const armed: ShipReading['setpoints'] = {
  ...shipAtStart.setpoints,
  ftl: { armed: true, jump: null },
};

/**
 * Seed 7's FTL scenario as the golden holds it, rounded to four significant
 * digits, which is coarser than the eight `/sim` sends: the spool armed at
 * tick 101 draws 900 MW and charges 450 MJ a tick.
 */
const spooling: ShipReading = {
  ...shipAtStart,
  tick: 101,
  time: 50.5,
  power: spoolLoad(900_000_000, 900_000_000),
  ftl: { status: 'spooling', charge: 450_000_000, sector: 'Sol', jumped: null },
  setpoints: armed,
};

/** Tick 120: the router sheds the spool, and the drive holds its 8.55 GJ. */
const held: ShipReading = {
  ...spooling,
  tick: 120,
  time: 60,
  power: spoolLoad(900_000_000, 0, ['ftl-spool']),
  ftl: { status: 'held', charge: 8_550_000_000, sector: 'Sol', jumped: null },
};

/** Tick 300: the charge is full at 90 GJ, and the drive still draws power. */
const charged: ShipReading = {
  ...spooling,
  tick: 300,
  time: 150,
  ftl: {
    status: 'charged',
    charge: 90_000_000_000,
    sector: 'Sol',
    jumped: null,
  },
};

/** Tick 301: the jump moved the ship to Kepler-442b and disarmed the drive. */
const jumped: ShipReading = {
  ...shipAtStart,
  tick: 301,
  time: 150.5,
  power: spoolLoad(0, 0),
  ftl: { status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 },
};

const idle = ['offline', 'No', '0.0 GJ', '0.0 MW', 'Sol', 'none'] as const;

describe('the FTL gauges', () => {
  test('read the ship with no drive at tick 0', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(await gauges('FTL gauges')).toEqual(idle);
  });

  test('name each gauge', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    const names = [
      ...(await screen.findByLabelText('FTL gauges')).querySelectorAll('dt'),
    ].map((dt) => dt.textContent);
    expect(names).toEqual([
      'Status',
      'Armed',
      'Spool charge',
      'Spool power',
      'Sector',
      'Last jump',
    ]);
  });

  test.for([
    [
      'the first tick of the spool',
      spooling,
      ['spooling', 'Yes', '0.5 GJ', '900.0 MW', 'Sol', 'none'],
    ],
    [
      'the tick the router sheds the spool',
      held,
      ['held', 'Yes', '8.6 GJ', '0.0 MW', 'Sol', 'none'],
    ],
    [
      'a full charge',
      charged,
      ['charged', 'Yes', '90.0 GJ', '900.0 MW', 'Sol', 'none'],
    ],
    [
      'the tick after the jump',
      jumped,
      ['idle', 'No', '0.0 GJ', '0.0 MW', 'Kepler-442b', 'tick 301'],
    ],
  ] as const)('read %s', async ([, ship, expected], { renderRoute }) => {
    await renderPage(renderRoute, withLink(linkAt(ship)));
    expect(await gauges('FTL gauges')).toEqual(expected);
  });

  test('head each section at the second level', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['FTL drive', 'Spool', 'Jump']);
  });

  test('say the snapshot is offline when it fails, and keep the controls', async ({
    renderRoute,
  }) => {
    await renderPage(renderRoute, withLink(FailingSnapshotLink));
    expect(await screen.findByText('Ship snapshot offline')).toBeDefined();
    expect(screen.queryByLabelText('FTL gauges')).toBeNull();
    expect(screen.getByRole('button', { name: 'Jump' })).toBeDefined();
  });
});

describe('the spool button', () => {
  test('posts the spool and shows the tick it queues for', async ({
    renderRoute,
  }) => {
    const scope = await renderPage(renderRoute);
    const spool = vi.spyOn(scope.get(BRIDGE_LINK), 'spool');
    fireEvent.click(screen.getByRole('button', { name: 'Spool drive' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(spool).toHaveBeenCalledOnce();
  });

  test('shows a refusal with its fix', async ({ renderRoute }) => {
    class Refusing extends FakeBridgeLink {
      override async spool(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 409,
          code: 'MERIDIAN_POWER_BUDGET',
          message:
            'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.',
          fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
        };
      }
    }
    await renderPage(renderRoute, withLink(Refusing));
    fireEvent.click(screen.getByRole('button', { name: 'Spool drive' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
    );
  });
});

describe('a command that is neither the spool nor the jump', () => {
  test('goes to the commands route for the ftl system and shows its refusal', async ({
    renderRoute,
  }) => {
    class Refusing extends FakeBridgeLink {
      override async command(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 400,
          code: 'MERIDIAN_BAD_COMMAND',
          message: 'No ship system serves ftl.',
        };
      }
    }
    function Reset() {
      const answer = useActionData<CommandAnswer>();
      return (
        <Form method="post">
          <button type="submit" name="command" value="reset">
            Reset
          </button>
          <output>{answer?.accepted === false ? answer.message : ''}</output>
        </Form>
      );
    }
    const { scope } = await renderRoute(
      { default: Reset, action: ftl.action },
      { path: '/systems/ftl', overrides: withLink(Refusing) },
    );
    const command = vi.spyOn(scope.get(BRIDGE_LINK), 'command');
    const spool = vi.spyOn(scope.get(BRIDGE_LINK), 'spool');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(await screen.findByText('No ship system serves ftl.')).toBeDefined();
    expect(command.mock.calls[0]?.[0]).toStrictEqual({
      system: 'ftl',
      action: 'reset',
    });
    expect(spool).not.toHaveBeenCalled();
  });
});

describe('the jump button', () => {
  test('lists the charted stars', async ({ renderRoute }) => {
    await renderPage(renderRoute);
    const select = screen.getByRole('combobox');
    expect(select.getAttribute('name')).toBe('to');
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(Object.keys(BUNDLED_CHARTS));
  });

  test('posts the star and shows the tick it queues for', async ({
    renderRoute,
  }) => {
    const scope = await renderPage(renderRoute);
    const jump = vi.spyOn(scope.get(BRIDGE_LINK), 'jump');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Proxima-b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Queued for tick 1',
    );
    expect(jump).toHaveBeenCalledExactlyOnceWith('Proxima-b');
  });

  test('shows a refusal with its fix', async ({ renderRoute }) => {
    class Refusing extends FakeBridgeLink {
      override async jump(): Promise<CommandAnswer> {
        return {
          accepted: false,
          status: 409,
          code: 'MERIDIAN_FTL_NOT_SPOOLED',
          message: 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.',
          fix: 'spool the drive and wait until it holds the full charge, then jump.',
        };
      }
    }
    await renderPage(renderRoute, withLink(Refusing));
    fireEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The FTL drive holds 0 GJ of the 90 GJ a jump needs.Fix: spool the drive and wait until it holds the full charge, then jump.',
    );
  });
});
