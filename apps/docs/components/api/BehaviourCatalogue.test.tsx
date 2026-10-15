import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BehaviourCatalogue from './BehaviourCatalogue';

/**
 * The rail names a case and the pane shows it.
 *
 * The one thing a reader can check against this block is that the source in
 * the pane is the source of the sentence they picked, so that is what these
 * drive: a click, then an arrow key, then what the pane holds each time. The
 * sidecar is stubbed because the component's job is the pairing, and
 * `doc-behaviour-render.test.ts` holds the real sidecars against the real
 * sentences.
 *
 * Ported from `Evanion/libraries`
 * `apps/docs/components/api/BehaviourCatalogue.test.tsx` at 92320250.
 */

const GROUPS = [
  {
    label: 'createTestingContainer',
    rows: [{ title: 'builds the root module', id: 7 }],
  },
  {
    label: 'a malformed override',
    rows: [
      { title: 'refuses a token the root never provides', id: 11 },
      { title: 'names the module the override targets', id: 12 },
    ],
  },
];

const SIDECAR = {
  bodies: {
    7: {
      where: 'libs/testing/src/index.test.ts',
      line: 41,
      html: '<span>expect(ship.get(Reactor))</span>',
    },
    11: {
      where: 'libs/testing/src/index.test.ts',
      line: 88,
      html: "<span>expect(error.code).toBe('NEXUS_OVERRIDE')</span>",
    },
    12: {
      where: 'libs/testing/src/index.test.ts',
      line: 102,
      html: '<span>expect(error.module)</span>',
    },
  },
  popups: {},
};

/**
 * A case whose tokens the compiler gave types, under its own library.
 *
 * Its own library because the fetch is cached per library and name for the
 * life of the module. The tokens are what `behaviour-data.mjs` writes: the
 * hover class and the number of the type in the sidecar's own dictionary. The
 * third token carries a number the sidecar does not hold.
 */
const TYPED_GROUPS = [
  {
    label: 'nodeScopes',
    rows: [{ title: 'keeps two runs apart', id: 3 }],
  },
];

const TYPED = {
  bodies: {
    3: {
      where: 'libs/node/src/index.test.ts',
      line: 18,
      html:
        '<span class="twoslash-hover" data-pop="0">scopes</span>' +
        '<span> = </span>' +
        '<span class="twoslash-hover" data-pop="1">nodeScopes</span>' +
        '<span class="twoslash-hover" data-pop="9">run</span>',
    },
  },
  popups: {
    0: '<code class="twoslash-popup-code">const scopes: NodeScopes</code>',
    1: '<code class="twoslash-popup-code">function nodeScopes(): NodeScopes</code>',
  },
};

/** The URLs the stubbed fetch was asked for, in order. */
let asked: string[] = [];

/**
 * The browser pieces jsdom does not bring, at their narrowest.
 *
 * `IntersectionObserver` fires once so the fetch happens, and `matchMedia`
 * answers "wide", which is the layout that puts the pane in its own column.
 */
beforeEach(() => {
  asked = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly seen: (entries: unknown[]) => void) {}
      observe() {
        this.seen([{ isIntersecting: true }]);
      }
      disconnect() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
    },
  );

  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

  serve((url) => (url.includes('/node/nodeScopes.json') ? TYPED : SIDECAR));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A fetch stub answering every URL with what `answer` returns for it. */
function serve(answer: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => answer(url) };
    }),
  );
}

/**
 * Renders inside an awaited act, so the cached sidecar's `then`, which lands a
 * microtask after the mount, applies inside it.
 */
async function show(element: ReactElement): Promise<RenderResult> {
  let result: RenderResult | undefined;
  await act(async () => {
    result = render(element);
  });
  return result as RenderResult;
}

// The fetch is cached per library and name for the whole module. A case that
// wants a different answer from the network asks for a different name.
const mount = (name = 'createTestingContainer') =>
  show(<BehaviourCatalogue library="testing" name={name} groups={GROUPS} />);

const mountTyped = () =>
  show(
    <BehaviourCatalogue
      library="node"
      name="nodeScopes"
      groups={TYPED_GROUPS}
    />,
  );

/** The pane once the sidecar's first case has reached it. */
const loaded = () =>
  screen.findByRole('region', { name: 'libs/testing/src/index.test.ts:41' });

/** The typed token spelling a name, once the sidecar has reached the pane. */
function reach(container: HTMLElement, text: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('[data-pop]')].find(
    (each) => each.textContent === text,
  );
  if (!found) throw new Error(`no token spells ${text}`);
  return found;
}

describe('BehaviourCatalogue', () => {
  it('names every sentence in the rail, under the group the suite wrote', async () => {
    await mount();
    await loaded();

    expect(screen.getByRole('group', { name: 'a malformed override' })).toBe(
      screen.getAllByRole('group')[1],
    );
    expect(
      screen.getAllByRole('option').map((each) => each.textContent),
    ).toEqual([
      'builds the root module',
      'refuses a token the root never provides',
      'names the module the override targets',
    ]);
  });

  it('titles the pane with the file and line of the case', async () => {
    await mount();

    const pane = await screen.findByRole('region', {
      name: 'libs/testing/src/index.test.ts:41',
    });
    expect(pane.textContent).toContain('expect(ship.get(Reactor))');
  });

  it('follows a click to the case the clicked sentence names', async () => {
    await mount();
    fireEvent.click(
      screen.getByRole('option', {
        name: 'names the module the override targets',
      }),
    );

    expect(
      (
        await screen.findByRole('region', {
          name: 'libs/testing/src/index.test.ts:102',
        })
      ).textContent,
    ).toContain('expect(error.module)');
  });

  it('moves the selection down the rail on an arrow key', async () => {
    await mount();
    const rail = screen.getByRole('listbox');
    fireEvent.keyDown(rail, { key: 'ArrowDown' });

    const selected = screen.getByRole('option', { selected: true });
    expect(selected.textContent).toBe(
      'refuses a token the root never provides',
    );
    expect(rail.getAttribute('aria-activedescendant')).toBe(selected.id);
    await screen.findByText("expect(error.code).toBe('NEXUS_OVERRIDE')");
  });

  it('stops at the last sentence and never wraps past it', async () => {
    await mount();
    await loaded();
    const rail = screen.getByRole('listbox');
    fireEvent.keyDown(rail, { key: 'End' });
    fireEvent.keyDown(rail, { key: 'ArrowDown' });

    expect(screen.getByRole('option', { selected: true }).textContent).toBe(
      'names the module the override targets',
    );
  });

  it('fetches the sidecar under the base path', async () => {
    vi.stubEnv('NEXUS_BASE_PATH', '/next');
    await show(
      <BehaviourCatalogue
        library="node"
        name="nodeScopes-under-next"
        groups={TYPED_GROUPS}
      />,
    );

    await waitFor(() =>
      expect(asked).toEqual([
        '/next/behaviour/node/nodeScopes-under-next.json',
      ]),
    );
  });

  it('encodes the export name in the sidecar URL', async () => {
    await show(
      <BehaviourCatalogue library="core" name="$weird" groups={GROUPS} />,
    );

    await waitFor(() =>
      expect(asked).toEqual([
        `/behaviour/core/${encodeURIComponent('$weird')}.json`,
      ]),
    );
  });

  it('says what happened when the cases do not load, and asks only once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return { ok: false, status: 404 };
      }),
    );
    const first = await mount('Missing');

    await screen.findByText(/The cases for Missing did not load/);
    first.unmount();
    await mount('Missing');

    await screen.findByText(/The cases for Missing did not load/);
    expect(asked).toEqual(['/behaviour/testing/Missing.json']);
  });

  it('states the type behind a token the pointer reached', async () => {
    const { container } = await mountTyped();
    const token = await waitFor(() => reach(container, 'scopes'));

    fireEvent.pointerOver(token);

    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('const scopes: NodeScopes');
    expect(token.getAttribute('aria-describedby')).toBe(card.id);
  });

  it('skips a token whose type the sidecar does not hold', async () => {
    const { container } = await mountTyped();
    const token = await waitFor(() => reach(container, 'run'));

    fireEvent.pointerOver(token);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(token.hasAttribute('aria-describedby')).toBe(false);
  });

  it('walks the typed tokens from the one tab stop the pane holds', async () => {
    const { container } = await mountTyped();
    const [first, second] = await waitFor(() => [
      reach(container, 'scopes'),
      reach(container, 'nodeScopes'),
    ]);

    act(() => first?.focus());
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowRight' });

    expect(
      [first, second].map((each) => each?.tabIndex),
      'A reference page mounts dozens of these, so the pane offers one stop ' +
        'and the arrows move it.',
    ).toEqual([-1, 0]);
    expect(screen.getByRole('tooltip').textContent).toContain(
      'function nodeScopes(): NodeScopes',
    );
  });

  it('keeps the card up while the pointer moves from the token onto it', async () => {
    const { container } = await mountTyped();
    const token = await waitFor(() => reach(container, 'scopes'));
    fireEvent.pointerOver(token);
    const card = screen.getByRole('tooltip');

    fireEvent.pointerLeave(container.querySelector('pre') as HTMLElement, {
      relatedTarget: card,
    });
    fireEvent.pointerEnter(card);
    await new Promise((settle) => setTimeout(settle, 300));
    expect(screen.getByRole('tooltip')).toBe(card);

    fireEvent.pointerLeave(card);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('names the card before any token takes focus', async () => {
    const { container } = await mountTyped();
    await waitFor(() => reach(container, 'scopes'));

    expect(container.querySelector('[role=tooltip]')?.id).toMatch(/-type$/);
  });

  it('takes the card back down on Escape', async () => {
    const { container } = await mountTyped();
    const token = await waitFor(() => reach(container, 'scopes'));

    fireEvent.pointerOver(token);
    fireEvent.keyDown(token, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each([
    ['wide', false],
    ['narrow', true],
  ])(
    'keeps the pane outside the listbox, which the rail names as what it controls, when %s',
    async (_layout, narrow) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: narrow,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      const { container } = await mount();
      await screen.findByRole('region', {
        name: 'libs/testing/src/index.test.ts:41',
      });

      const pane = container.querySelector('.nexus-behaviours__pane');
      expect(pane?.closest('[role=listbox]')).toBeNull();
      expect(screen.getByRole('listbox').getAttribute('aria-controls')).toBe(
        pane?.id,
      );
    },
  );

  it('keeps the cases out of the search index', async () => {
    const { container } = await mount();
    await loaded();

    expect(
      container
        .querySelector('.nexus-behaviours__pane')
        ?.getAttribute('data-pagefind-ignore'),
      'Pagefind indexes the prerendered markup, and the sentences are what a ' +
        'reader searches for; the cases are code and stay out of it.',
    ).toBe('all');
  });
});
