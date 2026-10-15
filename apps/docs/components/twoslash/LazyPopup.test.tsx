import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { Popup } from './LazyPopup';

/** One hover as Nextra's twoslash renderer writes it: the panel, then the button. */
const hover = (name = 'nodeScopes') => (
  <Popup className="twoslash-hover">
    <Popup.Panel className="twoslash-popup-container">
      <code className="twoslash-popup-code">{`const ${name}: NodeScopes`}</code>
    </Popup.Panel>
    <Popup.Button>{name}</Popup.Button>
  </Popup>
);

/** A fence of three typed tokens. */
const fence = () => (
  <pre>
    <code>
      {hover('first')} {hover('second')} {hover('third')}
    </code>
  </pre>
);

const buttons = () =>
  screen.getAllByRole('button') as [HTMLElement, HTMLElement, HTMLElement];

// The first pointer or focus imports the positioning; warmed here so a loaded
// run times the component and never the transform.
beforeAll(async () => {
  await import('./popup-position');
}, 30_000);

describe('Popup', () => {
  it('puts the type in the HTML, hidden in a span, under a real button', () => {
    const html = renderToString(hover());

    expect(html).toMatch(
      /<button type="button" class="nexus-popup__button">nodeScopes<\/button>/,
    );
    expect(html).toMatch(
      /<span hidden="" class="nexus-popup__panel [^"]*twoslash-popup-container"/,
    );
    expect(html).toContain('const nodeScopes: NodeScopes');
  });

  it('names the panel as the button description once it mounts', () => {
    render(hover());
    const button = screen.getByRole('button', { name: 'nodeScopes' });
    const panel = document.querySelector('.nexus-popup__panel') as HTMLElement;

    expect(panel.getAttribute('role')).toBe('tooltip');
    expect(button.getAttribute('aria-describedby')).toBe(panel.id);
  });

  it('opens the panel on the first focus and closes it on Escape', async () => {
    render(hover());
    const root = document.querySelector('.nexus-popup') as HTMLElement;
    const button = screen.getByRole('button', { name: 'nodeScopes' });
    const panel = document.querySelector('.nexus-popup__panel') as HTMLElement;

    act(() => button.focus());
    await waitFor(() =>
      expect(root.hasAttribute('data-positioned')).toBe(true),
    );
    expect(panel.hidden).toBe(false);

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(panel.hidden).toBe(true);
  });

  it('gives a fence one tab stop, on its first token', () => {
    render(fence());

    expect(buttons().map((each) => each.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves the tab stop with the arrow keys, Home and End', () => {
    render(fence());
    const [first, second, third] = buttons();

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    expect(buttons().map((each) => each.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(second, { key: 'End' });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });

  it('keeps each token described by its own panel', () => {
    render(fence());

    for (const button of buttons()) {
      const panel = document.getElementById(
        button.getAttribute('aria-describedby') ?? '',
      );
      expect(panel?.textContent).toContain(button.textContent ?? '');
    }
  });
});
