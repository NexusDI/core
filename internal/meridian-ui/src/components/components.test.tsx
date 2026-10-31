import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Alert,
  AlertRegion,
  Button,
  Chip,
  ConsoleFrame,
  HoloLabel,
  Marker,
  Notice,
  NOTICE_LABELS,
  Panel,
  Status,
  STATUS_GLYPHS,
  Terminal,
} from '../index.js';

describe('Panel', () => {
  it('renders a plate as a div by default', () => {
    const { container } = render(<Panel>Hull</Panel>);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.tagName).toBe('DIV');
    expect(panel.className).toBe('meridian-panel');
    expect(panel.firstElementChild?.className).toBe('meridian-panel__face');
    expect(panel.textContent).toBe('Hull');
  });

  it('renders no header band without a title or actions', () => {
    const { container } = render(<Panel>Hull</Panel>);
    expect(container.querySelector('.meridian-panel__head')).toBeNull();
  });

  it('renders no empty title when only actions are given', () => {
    const { container } = render(
      <Panel actions={<button type="button">Scram</button>}>Hull</Panel>,
    );
    expect(container.querySelector('.meridian-panel__title')).toBeNull();
    expect(container.querySelector('.meridian-panel__actions')).not.toBeNull();
  });

  it('renders the title as a placard and the actions at the header end', () => {
    const { container } = render(
      <Panel title="Reactor" actions={<button type="button">Scram</button>}>
        Hull
      </Panel>,
    );
    const head = container.querySelector('.meridian-panel__head');
    expect(head?.querySelector('.meridian-panel__title')?.textContent).toBe(
      'Reactor',
    );
    expect(head?.querySelector('.meridian-panel__actions')?.textContent).toBe(
      'Scram',
    );
    expect(container.querySelector('.meridian-panel__body')?.textContent).toBe(
      'Hull',
    );
  });

  it('renders the raised surface and keeps the caller class', () => {
    const { container } = render(
      <Panel as="aside" raised className="x">
        Hull
      </Panel>,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.tagName).toBe('ASIDE');
    expect(panel.className).toBe('meridian-panel meridian-panel--raised x');
  });
});

describe('Notice', () => {
  it('labels each kind with the public guidance label', () => {
    expect(NOTICE_LABELS).toEqual({
      note: 'Note',
      exception: 'Exception',
      warning: 'Warning',
      ship: 'Ship note',
    });
  });

  it('renders the label as text and the body beneath it', () => {
    render(<Notice kind="ship">The shuttle keeps its own flight log.</Notice>);
    const note = screen.getByRole('note');
    expect(note.className).toBe('meridian-notice meridian-notice--ship');
    expect(note.textContent).toBe(
      'Ship noteThe shuttle keeps its own flight log.',
    );
  });
});

describe('Notice glyphs', () => {
  it('draws a hidden glyph before each label', () => {
    const { container } = render(<Notice kind="warning">Heat.</Notice>);
    const glyph = container.querySelector('.meridian-notice__label svg');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ConsoleFrame', () => {
  it('names its region by the title and renders the slots in order', () => {
    render(
      <ConsoleFrame
        title="Scopes and REQUEST"
        tabs={<span>tabs</span>}
        actions={<span>run</span>}
      >
        <p>body</p>
      </ConsoleFrame>,
    );
    const region = screen.getByRole('region', { name: 'Scopes and REQUEST' });
    expect(region.textContent).toBe('Scopes and REQUESTtabsrunbody');
  });
});

describe('Marker', () => {
  it('renders a hidden lifetime glyph with the lifetime class', () => {
    const { container } = render(<Marker shape="lifetime" lifetime="scoped" />);
    const marker = container.firstElementChild as HTMLElement;
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    expect(marker.className).toBe(
      'meridian-marker meridian-marker--lifetime meridian-lifetime-scoped',
    );
  });
});

describe('Chip', () => {
  it('renders a span with the chip class and keeps the caller class', () => {
    const { container } = render(<Chip className="x">function</Chip>);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.tagName).toBe('SPAN');
    expect(chip.className).toBe('meridian-chip x');
    expect(chip.textContent).toBe('function');
  });
});

describe('Status', () => {
  const states = {
    charged: 'nominal',
    spooling: 'active',
    held: 'warning',
  } as const;

  it('renders a glyph, the word and the state class', () => {
    const { container } = render(<Status word="charged" states={states} />);
    const status = container.firstElementChild as HTMLElement;
    expect(status.className).toBe('meridian-status meridian-status--nominal');
    expect(status.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(status.textContent).toBe('charged');
  });

  it('shows a word the table lacks as standby', () => {
    const { container } = render(<Status word="calibrating" states={states} />);
    expect((container.firstElementChild as HTMLElement).className).toBe(
      'meridian-status meridian-status--standby',
    );
    expect(container.textContent).toBe('calibrating');
  });

  it('does not read a word from the prototype of the table', () => {
    const { container } = render(<Status word="constructor" states={states} />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      '--standby',
    );
  });

  it('gives each of the six states its own glyph', () => {
    expect(new Set(Object.values(STATUS_GLYPHS)).size).toBe(6);
  });
});

describe('Terminal', () => {
  const states = { ok: 'nominal', alarm: 'alarm' } as const;

  it('composes the console frame and renders the log region', () => {
    render(
      <Terminal
        title="bridge-api / telemetry"
        states={states}
        prompt="plot course"
        actions={<span>online</span>}
        lines={[
          {
            tick: 't 0042',
            source: 'helm',
            message: 'course plotted',
            status: 'ok',
          },
          {
            tick: 't 0044',
            source: 'safety',
            message: 'HYPOXIA in airlock',
            status: 'alarm',
            fix: 'seal the hatch',
          },
        ]}
      />,
    );
    const frame = screen.getByRole('region', {
      name: 'bridge-api / telemetry',
    });
    expect(frame.className).toBe('meridian-console meridian-terminal');
    const log = screen.getByRole('log');
    expect(log.querySelectorAll('.meridian-terminal__line')).toHaveLength(2);
    expect(log.firstElementChild?.className).toBe('meridian-terminal__lines');
    expect(log.textContent).toContain('t 0042helmcourse plottedok');
    expect(log.textContent).toContain('Fix: seal the hatch');
    expect(log.querySelectorAll('.meridian-status--alarm')).toHaveLength(1);
    expect(frame.textContent).toContain('online');
    expect(frame.querySelector('.meridian-terminal__prompt')?.textContent).toBe(
      '> plot course',
    );
  });

  it('renders no prompt line without a prompt', () => {
    const { container } = render(
      <Terminal title="log" states={states} lines={[]} />,
    );
    expect(container.querySelector('.meridian-terminal__prompt')).toBeNull();
  });
});

describe('Button', () => {
  it('renders a typed button with the variant class', () => {
    render(<Button variant="primary">Plot course</Button>);
    const button = screen.getByRole('button', { name: 'Plot course' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('meridian-button meridian-button--primary');
  });

  it('defaults to the secondary variant and adds the dense class', () => {
    render(
      <Button dense className="x">
        Spool drive
      </Button>,
    );
    expect(screen.getByRole('button').className).toBe(
      'meridian-button meridian-button--secondary meridian-button--dense x',
    );
  });

  it('states why a disabled button is disabled and points at the reason', () => {
    render(
      <Button
        id="launch"
        disabled
        reason="Launch is locked until the check passes"
      >
        Launch
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Launch' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe('launch-reason');
    expect(document.getElementById('launch-reason')?.textContent).toBe(
      'Launch is locked until the check passes',
    );
  });
});

describe('Button reason while enabled', () => {
  it('prints no reason and no description when disabled is false', () => {
    render(
      <Button id="launch" disabled={false} reason="Locked">
        Launch
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Launch' });
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(document.getElementById('launch-reason')).toBeNull();
  });
});

describe('Alert', () => {
  it('renders the alarm banner in an assertive live region', () => {
    render(
      <Alert
        variant="banner"
        code="HYPOXIA"
        subject="airlock"
        acknowledge={<button type="button">Acknowledge</button>}
      />,
    );
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
    expect(banner.className).toBe(
      'meridian-alert meridian-alert--banner meridian-alert--alarm',
    );
    expect(banner.textContent).toBe('HYPOXIA in airlockAcknowledge');
  });

  it('renders the warning banner into the polite region the app mounts', () => {
    const { rerender } = render(<AlertRegion />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.childElementCount).toBe(0);

    rerender(
      <AlertRegion>
        <Alert
          variant="banner"
          kind="warning"
          code="NO POWER"
          subject="shields"
        />
      </AlertRegion>,
    );
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('NO POWER in shields');
    expect(region.querySelector('.meridian-alert--warning')).not.toBeNull();
  });

  it('gives the warning banner no live role of its own', () => {
    const { container } = render(
      <Alert
        variant="banner"
        kind="warning"
        code="NO POWER"
        subject="shields"
      />,
    );
    expect(container.querySelector('[role], [aria-live]')).toBeNull();
  });

  it('renders the dialog for a refused command with its Fix line', () => {
    render(
      <Alert
        variant="dialog"
        id="refused"
        message="The drive is not charged."
        fix="Charge the reactor first."
        action={<button type="button">Understood</button>}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Command refused' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('refused-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('refused-message');
    expect(dialog.hasAttribute('aria-label')).toBe(false);
    expect(document.getElementById('refused-message')?.textContent).toBe(
      'The drive is not charged.',
    );
    expect(dialog.textContent).toBe(
      'Command refusedThe drive is not charged.Fix: Charge the reactor first.Understood',
    );
  });
});

describe('HoloLabel', () => {
  it('renders the title and each readout with its unit', () => {
    const { container } = render(
      <HoloLabel
        title="Reactor core"
        leader="end"
        readouts={[
          { label: 'Output', value: '42.0', unit: 'MW' },
          { label: 'Temperature', value: '1180', unit: 'K' },
        ]}
      />,
    );
    const label = screen.getByLabelText('Reactor core');
    expect(label.className).toBe('meridian-holo meridian-holo--leader-end');
    expect(label.querySelectorAll('.meridian-holo__readout')).toHaveLength(2);
    expect(label.textContent).toBe('Reactor coreOutput42.0MWTemperature1180K');
    expect(
      container
        .querySelector('.meridian-holo__leader')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('draws no leader line without a leader edge', () => {
    const { container } = render(
      <HoloLabel title="Hull" readouts={[{ label: 'Plates', value: 12 }]} />,
    );
    expect(container.querySelector('.meridian-holo__leader')).toBeNull();
  });
});
