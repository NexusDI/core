import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Popup } from './LazyPopup';
import { PagePopover } from './PagePopover';

/** A fence of three tokens as `tools/popup-fold.mjs` leaves them. */
const fence = () => (
  <pre>
    <code>
      <span className="twoslash-hover">
        <button
          type="button"
          className="nexus-popup__button"
          data-pop="a"
          tabIndex={0}
        >
          first
        </button>
      </span>{' '}
      <span className="twoslash-hover">
        <button
          type="button"
          className="nexus-popup__button"
          data-pop="b"
          tabIndex={-1}
        >
          second
        </button>
      </span>{' '}
      <span className="twoslash-hover">
        <button
          type="button"
          className="nexus-popup__button"
          data-pop="c"
          tabIndex={-1}
        >
          third
        </button>
      </span>
    </code>
  </pre>
);

const TABLE = {
  a: '<code class="twoslash-popup-code">const first: A</code>',
  b: '<code class="twoslash-popup-code">const second: B</code>',
  c: '<code class="twoslash-popup-code">const third: C</code>',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => TABLE })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <>
      {fence()}
      <PagePopover />
    </>,
  );

const token = (name: string) => screen.getByRole('button', { name });
const card = () => screen.queryByRole('tooltip');

describe('PagePopover', () => {
  it('shows the type of the token a pointer reaches, and names it as the description', async () => {
    mount();
    fireEvent.pointerOver(token('second'));

    await waitFor(() => expect(card()?.textContent).toBe('const second: B'));
    expect(token('second').getAttribute('aria-describedby')).toBe(card()?.id);
  });

  it('shows one card, for the last token reached', async () => {
    mount();
    fireEvent.pointerOver(token('first'));
    await waitFor(() => expect(card()?.textContent).toBe('const first: A'));
    fireEvent.pointerOver(token('third'));

    await waitFor(() => expect(card()?.textContent).toBe('const third: C'));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(token('first').hasAttribute('aria-describedby')).toBe(false);
  });

  it('opens on focus and closes on Escape', async () => {
    mount();
    act(() => token('first').focus());
    await waitFor(() => expect(card()).not.toBeNull());

    fireEvent.keyDown(token('first'), { key: 'Escape' });
    expect(card()).toBeNull();
  });

  it('toggles on a click with no pointer behind it, as Enter sends', async () => {
    mount();
    act(() => token('first').focus());
    await waitFor(() => expect(card()).not.toBeNull());

    fireEvent.click(token('first'), { detail: 0 });
    expect(card()).toBeNull();
    fireEvent.click(token('first'), { detail: 0 });
    await waitFor(() => expect(card()).not.toBeNull());
  });

  it('moves the fence tab stop with the arrow keys, Home and End', async () => {
    mount();
    act(() => token('first').focus());

    fireEvent.keyDown(token('first'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(token('second'));
    expect(
      ['first', 'second', 'third'].map((name) => token(name).tabIndex),
    ).toEqual([-1, 0, -1]);

    fireEvent.keyDown(token('second'), { key: 'End' });
    expect(document.activeElement).toBe(token('third'));
    fireEvent.keyDown(token('third'), { key: 'Home' });
    expect(document.activeElement).toBe(token('first'));
    fireEvent.keyDown(token('first'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(token('first'));
    await waitFor(() => expect(card()?.textContent).toBe('const first: A'));
  });

  it('fetches the table once', async () => {
    mount();
    fireEvent.pointerOver(token('first'));
    fireEvent.pointerOver(token('second'));
    await waitFor(() => expect(card()?.textContent).toBe('const second: B'));

    expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('the Popup fallback', () => {
  it('renders plain elements, with no client code', () => {
    const { container } = render(
      <Popup className="twoslash-hover">
        <Popup.Panel>type</Popup.Panel>
        <Popup.Button>token</Popup.Button>
      </Popup>,
    );

    expect(container.innerHTML).toBe(
      '<span class="twoslash-hover"><span hidden="">type</span><button type="button" class="nexus-popup__button">token</button></span>',
    );
  });
});
