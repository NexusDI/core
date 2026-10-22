import { render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { commandFrom } from '../../app/routes/systems/system-action.server';
import {
  ControlSection,
  Gauges,
  SystemPage,
} from '../../app/routes/systems/system-page';
import { built } from '../support/testing-di';

// system-action.server imports nexus.server, which builds the console's
// container at import.
vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

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
});
