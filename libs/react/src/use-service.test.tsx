import {
  defineModule,
  isNexusError,
  MultiToken,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { render, renderHook, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NexusProvider,
  NoProviderError,
  useContainer,
  useService,
} from './index.js';
import { Boundary } from './support/boundary.js';

interface Diagnostic {
  readonly system: string;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const reactor: Diagnostic = { system: 'reactor' };
const hull: Diagnostic = { system: 'hull' };

afterEach(() => vi.restoreAllMocks());

describe('useService', () => {
  it('throws NEXUS_REACT_NO_PROVIDER outside a provider, naming the hook', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useService(FLIGHT_LOG))).toThrow(
      NoProviderError,
    );
    let caught: unknown;
    try {
      renderHook(() => useContainer());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NoProviderError);
    expect((caught as NoProviderError).hook).toBe('useContainer');
  });

  it('lets a get() error reach the error boundary unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    function Log() {
      useService(FLIGHT_LOG);
      return null;
    }
    const view = render(
      <Boundary>
        <NexusProvider container={ship}>
          <Log />
        </NexusProvider>
      </Boundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'NEXUS_MISSING_PROVIDER',
    );
    view.unmount();
  });

  it('throws NEXUS_SCOPE_REQUIRED for a scoped token under the root', async () => {
    await using ship = await Nexus.create([
      provide(FLIGHT_LOG, {
        useFactory: () => ({ record: () => undefined, entries: () => [] }),
        lifetime: 'scoped',
      }),
    ]);
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <NexusProvider container={ship}>{children}</NexusProvider>
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let caught: unknown;
    try {
      renderHook(() => useService(FLIGHT_LOG), { wrapper });
    } catch (error) {
      caught = error;
    }
    expect(isNexusError(caught, 'NEXUS_SCOPE_REQUIRED')).toBe(true);
  });

  it('returns the same MultiToken array while its contents match', async () => {
    await using ship = await Nexus.create([
      provide(DIAGNOSTICS, { useValue: reactor }),
    ]);
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <StrictMode>
        <NexusProvider container={ship}>{children}</NexusProvider>
      </StrictMode>
    );
    const { result, rerender, unmount } = renderHook(
      () => useService(DIAGNOSTICS),
      {
        wrapper,
      },
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual([reactor]);
    unmount();
  });

  it('returns a new array after a load() adds a contribution', async () => {
    await using ship = await Nexus.create([
      provide(DIAGNOSTICS, { useValue: reactor }),
    ]);
    const Hull = defineModule({
      name: 'Hull',
      providers: [provide(DIAGNOSTICS, { useValue: hull })],
      exports: [DIAGNOSTICS],
    });
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <NexusProvider container={ship}>{children}</NexusProvider>
    );
    const { result, rerender, unmount } = renderHook(
      () => useService(DIAGNOSTICS),
      {
        wrapper,
      },
    );
    const before = result.current;
    await ship.load(Hull);
    rerender();
    expect(result.current).not.toBe(before);
    expect(result.current.map((d) => d.system)).toEqual(['reactor', 'hull']);
    unmount();
  });
});
