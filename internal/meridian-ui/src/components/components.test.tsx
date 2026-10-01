import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ConsoleFrame,
  Marker,
  Notice,
  NOTICE_LABELS,
  Panel,
} from '../index.js';

describe('Panel', () => {
  it('renders a glass surface as a div by default', () => {
    const { container } = render(<Panel>Hull</Panel>);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.tagName).toBe('DIV');
    expect(panel.className).toBe('meridian-panel');
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
