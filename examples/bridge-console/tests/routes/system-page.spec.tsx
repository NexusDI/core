import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { commandFrom } from '../../app/routes/systems/system-action.server';
import {
  ControlSection,
  Gauges,
  ItemList,
  LevelForm,
  NumberForm,
  SnapshotOffline,
  SystemPage,
  ToggleForm,
} from '../../app/routes/systems/system-page';

// system-action.server imports nexus.server, which builds the console's
// container at import.
vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

/** A posted form with `fields`. */
function formOf(fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

describe('commandFrom', () => {
  it('reads each argument as its kind', () => {
    const form = formOf({
      command: 'heater',
      compartment: 'habitat',
      target: '293.5',
      open: 'false',
    });
    expect(
      commandFrom(form, 'life-support', {
        compartment: 'text',
        target: 'number',
        open: 'boolean',
      }),
    ).toEqual({
      system: 'life-support',
      action: 'heater',
      compartment: 'habitat',
      target: 293.5,
      open: false,
    });
  });

  it('leaves out a blank or missing field and a boolean that is neither true nor false', () => {
    const form = formOf({
      command: 'throttle',
      level: '',
      raised: 'yes',
      compartment: '',
    });
    expect(
      commandFrom(form, 'engineering', {
        level: 'number',
        raised: 'boolean',
        compartment: 'text',
        mode: 'text',
      }),
    ).toStrictEqual({ system: 'engineering', action: 'throttle' });
  });

  it('sends an empty action when the form names no command', () => {
    expect(commandFrom(formOf({}), 'engineering', {})).toEqual({
      system: 'engineering',
      action: '',
    });
  });
});

describe('commandFrom with a record of systems', () => {
  const systems = { pump: 'life-support', open: 'safety' };

  it('reads the system of each action from the record', () => {
    expect(
      commandFrom(
        formOf({ command: 'pump', compartment: 'airlock', mode: 'fill' }),
        systems,
        { compartment: 'text', mode: 'text', door: 'text' },
      ),
    ).toEqual({
      system: 'life-support',
      action: 'pump',
      compartment: 'airlock',
      mode: 'fill',
    });
    expect(
      commandFrom(formOf({ command: 'open', door: 'airlock-outer' }), systems, {
        door: 'text',
      }),
    ).toEqual({ system: 'safety', action: 'open', door: 'airlock-outer' });
  });

  it('sends an empty system for an action outside the record', () => {
    expect(
      commandFrom(formOf({ command: 'flood' }), systems, {}),
    ).toStrictEqual({ system: '', action: 'flood' });
  });

  it('does not read a system off the prototype', () => {
    for (const action of ['constructor', 'toString', '__proto__']) {
      expect(
        commandFrom(formOf({ command: action }), systems, {}),
      ).toStrictEqual({ system: '', action });
    }
  });
});

describe('the system page pieces', () => {
  it('lists the gauges under their accessible name', () => {
    render(
      <Gauges
        label="Reactor gauges"
        gauges={[
          ['Level', '0.50'],
          ['Coolant', '300.0 K'],
        ]}
      />,
    );
    const list = screen.getByLabelText('Reactor gauges');
    expect(
      [...list.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['Level', 'Coolant']);
    expect(
      [...list.querySelectorAll('dd')].map((dd) => dd.textContent),
    ).toEqual(['0.50', '300.0 K']);
  });

  it('lists the items under their accessible name', () => {
    render(<ItemList label="Alarms" none="No alarms" items={['A', 'B']} />);
    const list = screen.getByRole('list', { name: 'Alarms' });
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['A', 'B']);
    expect(screen.queryByText('No alarms')).toBeNull();
  });

  it('says none in place of an empty list', () => {
    render(<ItemList label="Alarms" none="No alarms" items={[]} />);
    expect(screen.getByText('No alarms')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('heads a control section with its title', () => {
    render(<ControlSection title="Reactor">controls</ControlSection>);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Reactor' }),
    ).toBeDefined();
  });

  it('shows no answer before a command', () => {
    render(<SystemPage answer={undefined}>page</SystemPage>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the tick of an accepted command', () => {
    render(<SystemPage answer={{ accepted: true, tick: 4 }}>page</SystemPage>);
    expect(screen.getByRole('status').textContent).toBe('Queued for tick 4');
  });

  it('shows one line per flight-log entry under the tick', () => {
    render(
      <SystemPage
        answer={{
          accepted: true,
          tick: 4,
          flightLog: [
            'survey-7: opened bridge-habitat',
            'survey-7: closed airlock-outer',
          ],
        }}
      >
        page
      </SystemPage>,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(
      'Queued for tick 4survey-7: opened bridge-habitatsurvey-7: closed airlock-outer',
    );
    expect(
      [...status.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual([
      'survey-7: opened bridge-habitat',
      'survey-7: closed airlock-outer',
    ]);
  });

  it('shows no list when the answer has no flight log', () => {
    render(<SystemPage answer={{ accepted: true, tick: 4 }}>page</SystemPage>);
    expect(screen.getByRole('status').querySelector('li')).toBeNull();
  });

  it('shows a refusal and its fix', () => {
    render(
      <SystemPage
        answer={{
          accepted: false,
          status: 409,
          code: 'E',
          message: 'Refused.',
          fix: 'Try later.',
        }}
      >
        page
      </SystemPage>,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Refused.Fix: Try later.',
    );
  });

  it('says the ship snapshot is offline', () => {
    render(<SnapshotOffline />);
    expect(screen.getByText('Ship snapshot offline')).toBeDefined();
  });

  it('posts a number with the hidden fields it is given', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <NumberForm
            command="heater"
            name="target"
            label="Target (K)"
            button="Set"
            min={283}
            max={303}
            step={0.1}
            defaultValue={293}
            hidden={{ compartment: 'habitat' }}
          />
        ),
      },
    ]);
    render(<Stub />);
    const form = (await screen.findByLabelText('Target (K)')).closest('form');
    const hidden = [
      ...(form?.querySelectorAll('input[type="hidden"]') ?? []),
    ].map((input) => [input.getAttribute('name'), input.getAttribute('value')]);
    expect(hidden).toEqual([
      ['command', 'heater'],
      ['compartment', 'habitat'],
    ]);
  });

  it('posts a command with a true button and a false button', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <ToggleForm
            command="vent"
            field="open"
            on="Open vent"
            off="Shut vent"
            hidden={{ compartment: 'airlock' }}
          />
        ),
      },
    ]);
    render(<Stub />);
    const on = await screen.findByRole('button', { name: 'Open vent' });
    const off = screen.getByRole('button', { name: 'Shut vent' });
    expect([on.getAttribute('name'), on.getAttribute('value')]).toEqual([
      'open',
      'true',
    ]);
    expect([off.getAttribute('name'), off.getAttribute('value')]).toEqual([
      'open',
      'false',
    ]);
    const form = on.closest('form');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="command"]')?.value,
    ).toBe('vent');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="compartment"]')?.value,
    ).toBe('airlock');
  });

  it('posts a level from 0 to 1 under the command it is given', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <LevelForm
            command="burn"
            label="Burn level"
            button="Burn"
            defaultValue={0.5}
          />
        ),
      },
    ]);
    render(<Stub />);
    const input = await screen.findByLabelText('Burn level');
    expect(input.getAttribute('name')).toBe('level');
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('1');
    expect(input.getAttribute('step')).toBe('0.01');
    expect((input as HTMLInputElement).value).toBe('0.5');
    expect((input as HTMLInputElement).required).toBe(true);
    const form = input.closest('form');
    expect(
      form?.querySelector<HTMLInputElement>('input[name="command"]')?.value,
    ).toBe('burn');
    expect(screen.getByRole('button', { name: 'Burn' })).toBeDefined();
  });
});
