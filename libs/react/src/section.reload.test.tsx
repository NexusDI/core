import * as core from '@nexusdi/core';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type React = typeof import('./index.js');

const KEY = 'nexusdi:section-reload';

// The reload flag lives for one page, so each test imports the package
// afresh: a new module graph stands for the page after a reload. Core
// stays one copy, so the package reads the test's modules and tokens.
let api: React;
beforeEach(async () => {
  sessionStorage.clear();
  vi.resetModules();
  api = await import('./index.js');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(ui: ReactNode) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(ui);
  });
  return view;
}

function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  return reload;
}

/** A page that loads the section module, then the edit of it under the same name. */
async function edit() {
  const { defineModule, Nexus, provide, Token } = core;
  const { lazySection, NexusProvider, SectionBoundary, useService } = api;
  const NAV_CHARTS = new Token<{ heading: number }>('NavCharts');
  const module = () =>
    defineModule({
      name: 'Navigation',
      providers: [provide(NAV_CHARTS, { useValue: { heading: 42 } })],
      exports: [NAV_CHARTS],
    });
  function Heading() {
    return <p>{useService(NAV_CHARTS).heading}</p>;
  }
  const seen: { error?: unknown } = {};
  function Capture({ error }: { error: unknown; retry(): void }) {
    seen.error = error;
    return <p>failed</p>;
  }
  const ship = await Nexus.create([]);
  const tree = (ref: ReturnType<typeof module>) => (
    <NexusProvider container={ship}>
      <SectionBoundary
        section={lazySection('navigation', async () => ref)}
        fallback={<p>Loading</p>}
        errorFallback={Capture}
      >
        <Heading />
      </SectionBoundary>
    </NexusProvider>
  );
  const view = await mount(tree(module()));
  await screen.findByText('42');
  const again = () => act(async () => view.rerender(tree(module())));
  await again();
  const conflict = () =>
    core.isNexusError(seen.error, 'NEXUS_REACT_SECTION_CONFLICT');
  return { view, again, conflict, ship };
}

describe('the development reload guard', () => {
  it('records the reload, logs it and reloads once for an edited section module', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const reload = stubReload();
    const { view, ship } = await edit();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("'navigation'"));
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? '{}')).toEqual({
      section: 'navigation',
      at: expect.any(Number),
    });
    view.unmount();
    await ship[Symbol.asyncDispose]();
  });

  it('waits for the page to go away on a second edit before the reload lands', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const reload = stubReload();
    const { view, again, conflict, ship } = await edit();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await again();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(conflict()).toBe(false);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    view.unmount();
    await ship[Symbol.asyncDispose]();
  });

  it('reports the conflict on the page after a reload less than 10 seconds old', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = stubReload();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ section: 'navigation', at: Date.now() - 9_000 }),
    );
    const { view, conflict, ship } = await edit();
    await screen.findByText('failed');
    expect(conflict()).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    view.unmount();
    await ship[Symbol.asyncDispose]();
  });

  it('reloads again when the last reload is 10 seconds old', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const reload = stubReload();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ section: 'navigation', at: Date.now() - 10_000 }),
    );
    const { view, ship } = await edit();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    view.unmount();
    await ship[Symbol.asyncDispose]();
  });

  it('reloads when the last reload names another section', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const reload = stubReload();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ section: 'cartography', at: Date.now() }),
    );
    const { view, ship } = await edit();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    view.unmount();
    await ship[Symbol.asyncDispose]();
  });

  it.each(['getItem', 'setItem'] as const)(
    'reports the conflict without a reload when %s throws',
    async (method) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const reload = stubReload();
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('denied');
      });
      const { view, conflict, ship } = await edit();
      await screen.findByText('failed');
      expect(reload).not.toHaveBeenCalled();
      expect(conflict()).toBe(true);
      view.unmount();
      await ship[Symbol.asyncDispose]();
    },
  );
});
