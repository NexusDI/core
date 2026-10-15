import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
  type ModuleRef,
} from '@nexusdi/core';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { lazySection, NexusProvider, SectionBoundary } from './index.js';

// A production build replaces process.env.NODE_ENV, so dev.ts reads false.
vi.mock('./dev.js', () => ({ dev: false }));

const NAV_CHARTS = new Token<{ heading: number }>('NavCharts');
const navigation = () =>
  defineModule({
    name: 'Navigation',
    providers: [provide(NAV_CHARTS, { useValue: { heading: 42 } })],
    exports: [NAV_CHARTS],
  });

/** render() inside an awaited act(), so React runs the work use() suspends on. */
async function mount(ui: ReactNode) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(ui);
  });
  return view;
}
async function remount(view: ReturnType<typeof render>, ui: ReactNode) {
  await act(async () => view.rerender(ui));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SectionBoundary in production', () => {
  it('fails with the conflict for a second module of the same name, with no reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await using ship = await Nexus.create([]);
    const seen: { error?: unknown } = {};
    function Capture({ error }: { error: unknown; retry(): void }) {
      seen.error = error;
      return <p>failed</p>;
    }
    const tree = (module: ModuleRef) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => module)}
          errorFallback={Capture}
        >
          <p>ready</p>
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree(navigation()));
    await screen.findByText('ready');
    await remount(view, tree(navigation()));
    await screen.findByText('failed');
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    view.unmount();
  });
});
