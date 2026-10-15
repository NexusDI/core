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
const hover = () => (
  <Popup className="twoslash-hover">
    <Popup.Panel className="twoslash-popup-container">
      <code className="twoslash-popup-code">
        function nodeScopes(): NodeScopes
      </code>
    </Popup.Panel>
    <Popup.Button>nodeScopes</Popup.Button>
  </Popup>
);

// The first pointer imports the positioning; warmed here so a loaded run
// times the component and never the transform.
beforeAll(async () => {
  await import('./popup-position');
}, 30_000);

describe('Popup', () => {
  it('puts the type in the HTML, hidden, under a real button', () => {
    const html = renderToString(hover());

    expect(html).toMatch(
      /<button type="button" class="nexus-popup__button">nodeScopes<\/button>/,
    );
    expect(html).toMatch(
      /<div hidden="" class="nexus-popup__panel [^"]*twoslash-popup-container"/,
    );
    expect(html).toContain('function nodeScopes(): NodeScopes');
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
});
