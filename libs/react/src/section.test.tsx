import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
  type ModuleRef,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { createTestingContainer } from '@nexusdi/testing';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  Component,
  StrictMode,
  Suspense,
  startTransition,
  use,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  lazySection,
  NexusProvider,
  ScopeProvider,
  SectionBoundary,
  useService,
} from './index.js';
import { Boundary } from '../test-support/boundary.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
  exports: [NAV_CHARTS],
});

const HELM = new Token<string>('Helm');
const COURSE = new Token<string>('Course');
function Course() {
  return <p>{useService(COURSE)}</p>;
}

function Heading() {
  return <p>{useService(NAV_CHARTS).plot('Kepler-442b').heading}</p>;
}
function Failed({ error, retry }: { error: unknown; retry(): void }) {
  return (
    <button type="button" onClick={retry}>
      {((error as Error).cause as Error | undefined)?.message ??
        (error as Error).message}
    </button>
  );
}
const loadEvents = (events: TraceEvent[]) =>
  events.filter(
    (e) => e.type === 'compile' && (e as { phase?: string }).phase === 'load',
  ).length;

/** An errorFallback that keeps the error it renders. */
function capture() {
  const seen: { error?: unknown } = {};
  const record = (error: unknown) => {
    seen.error = error;
  };
  function Capture({ error }: { error: unknown; retry(): void }) {
    record(error);
    return <p>failed</p>;
  }
  return { seen, Capture };
}

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

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lazySection', () => {
  it('returns the name and the loader and runs nothing', () => {
    const loader = vi.fn(async () => Navigation);
    expect(lazySection('navigation', loader)).toEqual({
      name: 'navigation',
      loader,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps the options on the frozen handle', () => {
    const options = { imports: [Navigation] };
    const section = lazySection('navigation', async () => Navigation, options);
    expect(section.options).toBe(options);
    expect(Object.isFrozen(section)).toBe(true);
  });
});

describe('SectionBoundary', () => {
  it('loads the section once for two boundaries, under StrictMode', async () => {
    const events: TraceEvent[] = [];
    await using ship = await Nexus.create([], {
      plugins: [trace((e) => events.push(e))],
    });
    const loader = vi.fn(async () => Navigation);
    const section = lazySection('navigation', loader);
    const view = await mount(
      <StrictMode>
        <NexusProvider container={ship}>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Heading />
          </SectionBoundary>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Heading />
          </SectionBoundary>
        </NexusProvider>
      </StrictMode>,
    );
    expect(await screen.findAllByText('42')).toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loadEvents(events)).toBe(1);
    view.unmount();
  });

  it('loads a section with a grant once and renders a component that reads a granted token', async () => {
    const events: TraceEvent[] = [];
    const Helm = defineModule({
      name: 'Helm',
      providers: [provide(HELM, { useValue: 'helm-1' })],
      exports: [HELM],
    });
    const Chart = defineModule({
      name: 'Chart',
      providers: [
        provide(COURSE, {
          useFactory: (helm: string) => `course by ${helm}`,
          deps: [HELM],
        }),
      ],
      exports: [COURSE],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Helm] }),
      { plugins: [trace((e) => events.push(e))] },
    );
    const load = vi.spyOn(ship, 'load');
    const section = lazySection('chart', async () => Chart, {
      imports: [Helm],
    });
    const view = await mount(
      <StrictMode>
        <NexusProvider container={ship}>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Course />
          </SectionBoundary>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Course />
          </SectionBoundary>
        </NexusProvider>
      </StrictMode>,
    );
    expect(await screen.findAllByText('course by helm-1')).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(Chart, { imports: [Helm] });
    expect(loadEvents(events)).toBe(1);
    view.unmount();
  });

  it('shares one load between two section names with the same module and grant', async () => {
    const Helm = defineModule({
      name: 'Helm',
      providers: [provide(HELM, { useValue: 'helm-1' })],
      exports: [HELM],
    });
    const Chart = defineModule({
      name: 'Chart',
      providers: [
        provide(COURSE, {
          useFactory: (helm: string) => `course by ${helm}`,
          deps: [HELM],
        }),
      ],
      exports: [COURSE],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Helm] }),
    );
    const load = vi.spyOn(ship, 'load');
    const grant = { imports: [Helm] };
    const one = lazySection('chart-one', async () => Chart, grant);
    const two = lazySection('chart-two', async () => Chart, {
      imports: [Helm],
    });
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary section={one} fallback={<p>Loading</p>}>
          <Course />
        </SectionBoundary>
        <SectionBoundary section={two} fallback={<p>Loading</p>}>
          <Course />
        </SectionBoundary>
      </NexusProvider>,
    );
    expect(await screen.findAllByText('course by helm-1')).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('retries a failed load of a granted section', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Helm = defineModule({
      name: 'Helm',
      providers: [provide(HELM, { useValue: 'helm-1' })],
      exports: [HELM],
    });
    const Chart = defineModule({
      name: 'Chart',
      providers: [
        provide(COURSE, {
          useFactory: (helm: string) => `course by ${helm}`,
          deps: [HELM],
        }),
      ],
      exports: [COURSE],
    });
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Helm] }),
    );
    const load = vi
      .spyOn(ship, 'load')
      .mockRejectedValueOnce(new Error('chart offline'));
    const section = lazySection('chart', async () => Chart, {
      imports: [Helm],
    });
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={section}
          fallback={<p>Loading</p>}
          errorFallback={Failed}
        >
          <Course />
        </SectionBoundary>
      </NexusProvider>,
    );
    const retry = await screen.findByRole('button');
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => retry.click());
    expect(await screen.findByText('course by helm-1')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('leaves the module loaded on unmount and renders the next mount at once', async () => {
    await using ship = await Nexus.create([]);
    const loader = vi.fn(async () => Navigation);
    const section = lazySection('navigation', loader);
    const tree = (
      <NexusProvider container={ship}>
        <SectionBoundary section={section} fallback={<p>Loading</p>}>
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const first = await mount(tree);
    await screen.findByText('42');
    first.unmount();
    expect(ship.get(NAV_CHARTS)).toBe(fakeCharts);
    const second = await mount(tree);
    expect(screen.queryByText('Loading')).toBeNull();
    expect(screen.getByText('42')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('loads each section again into a swapped container', async () => {
    await using first = await Nexus.create([]);
    await using second = await Nexus.create([]);
    const loader = vi.fn(async () => Navigation);
    const section = lazySection('navigation', loader);
    const tree = (ship: Nexus) => (
      <NexusProvider container={ship}>
        <SectionBoundary section={section} fallback={<p>Loading</p>}>
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree(first));
    await screen.findByText('42');
    await remount(view, tree(second));
    await screen.findByText('42');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(second.get(NAV_CHARTS)).toBe(fakeCharts);
    view.unmount();
  });

  it('shows errorFallback on a load failure, calls onError once, and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    let attempt = 0;
    const down = new Error('remote down');
    const section = lazySection('navigation', async () => {
      attempt += 1;
      if (attempt === 1) throw down;
      return Navigation;
    });
    const onError = vi.fn();
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={section}
          errorFallback={Failed}
          onError={onError}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    const button = await screen.findByRole('button');
    expect(button.textContent).toBe('remote down');
    expect(onError).toHaveBeenCalledTimes(1);
    const [reported] = onError.mock.calls[0] ?? [];
    expect(isNexusError(reported, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
    expect(reported).toMatchObject({ section: 'navigation', cause: down });
    await act(async () => button.click());
    expect(await screen.findByText('42')).toBeTruthy();
    expect(attempt).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('rethrows a load failure to the app boundary without errorFallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const view = await mount(
      <Boundary>
        <NexusProvider container={ship}>
          <SectionBoundary
            section={lazySection('navigation', async () => {
              throw new Error('remote down');
            })}
          >
            <Heading />
          </SectionBoundary>
        </NexusProvider>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'remote down',
    );
    view.unmount();
  });

  it('hands React an error that names the section and carries the load error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const down = new Error('remote down');
    const caught: unknown[] = [];
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <NexusProvider container={ship}>
          <SectionBoundary
            section={lazySection('navigation', async () => {
              throw down;
            })}
            errorFallback={Failed}
          >
            <Heading />
          </SectionBoundary>
        </NexusProvider>,
        { onCaughtError: (error) => caught.push(error) },
      );
    });
    await screen.findByRole('button');
    expect(caught).toHaveLength(1);
    const [error] = caught;
    expect(isNexusError(error, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
    expect(error).toMatchObject({ section: 'navigation', cause: down });
    expect((error as Error).message).toContain("'navigation'");
    expect((error as Error).message).toContain('remote down');
    view.unmount();
  });

  it('hands onError, errorFallback and React the same SectionError, a string cause included', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const { seen, Capture } = capture();
    const order: string[] = [];
    const onError = vi.fn((_error: unknown) => order.push('onError'));
    const caught: unknown[] = [];
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <NexusProvider container={ship}>
          <SectionBoundary
            section={lazySection('navigation', () => Promise.reject('offline'))}
            errorFallback={Capture}
            onError={onError}
          >
            <Heading />
          </SectionBoundary>
        </NexusProvider>,
        {
          onCaughtError: (error) => {
            order.push('caught');
            caught.push(error);
          },
        },
      );
    });
    await screen.findByText('failed');
    expect(order).toEqual(['onError', 'caught']);
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
    expect(seen.error).toMatchObject({
      section: 'navigation',
      cause: 'offline',
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(seen.error);
    expect(caught).toEqual([seen.error]);
    view.unmount();
  });

  it('hands React the conflict error itself for a section conflict', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    const caught: unknown[] = [];
    const { seen, Capture } = capture();
    const tree = (module: ModuleRef) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => module)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree(Navigation), {
        onCaughtError: (error) => caught.push(error),
      });
    });
    await screen.findByText('42');
    await remount(view, tree(Other));
    await screen.findByText('failed');
    expect(caught).toEqual([seen.error]);
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    view.unmount();
  });

  it('hands onError the very SectionError the boundary rethrows without errorFallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const down = new Error('remote down');
    const order: string[] = [];
    const onError = vi.fn((_error: unknown) => order.push('onError'));
    const caught: unknown[] = [];
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <Boundary>
          <NexusProvider container={ship}>
            <SectionBoundary
              section={lazySection('navigation', async () => {
                throw down;
              })}
              onError={onError}
            >
              <Heading />
            </SectionBoundary>
          </NexusProvider>
        </Boundary>,
        {
          onCaughtError: (error) => {
            order.push('caught');
            caught.push(error);
          },
        },
      );
    });
    await screen.findByRole('alert');
    expect(order).toEqual(['onError', 'caught']);
    expect(onError).toHaveBeenCalledTimes(1);
    const [reported] = onError.mock.calls[0] ?? [];
    expect(isNexusError(reported, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
    expect(reported).toMatchObject({ section: 'navigation', cause: down });
    expect(caught).toHaveLength(1);
    expect(caught[0]).toBe(reported);
    view.unmount();
  });

  it('starts a fresh load when the app boundary resets after a rethrown failure, once per failure under StrictMode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    let attempt = 0;
    const section = lazySection('navigation', async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('remote down');
      return Navigation;
    });
    const onError = vi.fn();
    class Resettable extends Component<
      { children?: ReactNode },
      { error: unknown }
    > {
      override state: { error: unknown } = { error: null };
      static getDerivedStateFromError(error: unknown) {
        return { error };
      }
      override render() {
        if (this.state.error === null) return this.props.children;
        return (
          <button type="button" onClick={() => this.setState({ error: null })}>
            Reset
          </button>
        );
      }
    }
    const view = await mount(
      <StrictMode>
        <Resettable>
          <NexusProvider container={ship}>
            <SectionBoundary section={section} onError={onError}>
              <Heading />
            </SectionBoundary>
          </NexusProvider>
        </Resettable>
      </StrictMode>,
    );
    const reset = await screen.findByRole('button');
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => reset.click());
    expect(await screen.findByText('42')).toBeTruthy();
    expect(attempt).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('rethrows the same SectionError, with no second onError, when errorFallback goes away while it shows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const down = new Error('remote down');
    const section = lazySection('navigation', async () => {
      throw down;
    });
    const onError = vi.fn();
    const { seen, Capture } = capture();
    const tree = (errorFallback?: typeof Capture) => (
      <Boundary>
        <NexusProvider container={ship}>
          <SectionBoundary
            section={section}
            errorFallback={errorFallback}
            onError={onError}
          >
            <Heading />
          </SectionBoundary>
        </NexusProvider>
      </Boundary>
    );
    const view = await mount(tree(Capture));
    await screen.findByText('failed');
    await remount(view, tree());
    await screen.findByRole('alert');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(seen.error);
    expect(screen.getByRole('alert').textContent).toBe(
      (seen.error as Error).message,
    );
    view.unmount();
  });

  it('surfaces a load failure to the app boundary when a transition render yields', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const down = new Error('remote down');
    let loads = 0;
    const section = lazySection('navigation', async () => {
      loads += 1;
      throw down;
    });
    const onError = vi.fn();
    function Slow() {
      const end = Date.now() + 3;
      while (Date.now() < end) continue;
      return null;
    }
    const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const acting = flags.IS_REACT_ACT_ENVIRONMENT;
    flags.IS_REACT_ACT_ENVIRONMENT = false;
    const caught: unknown[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host, {
      onCaughtError: (error) => caught.push(error),
    });
    try {
      startTransition(() =>
        root.render(
          <div>
            <Boundary>
              <NexusProvider container={ship}>
                <SectionBoundary section={section} onError={onError}>
                  <Heading />
                </SectionBoundary>
              </NexusProvider>
            </Boundary>
            {Array.from({ length: 20 }, (_, i) => (
              <Slow key={i} />
            ))}
          </div>,
        ),
      );
      await waitFor(
        () => {
          expect(host.querySelector('[role="alert"]')).not.toBeNull();
        },
        { timeout: 3000 },
      );
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'remote down',
      );
      expect(caught).toHaveLength(1);
      expect(isNexusError(caught[0], 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
      expect(loads).toBe(1);
    } finally {
      flags.IS_REACT_ACT_ENVIRONMENT = acting;
      root.unmount();
      host.remove();
    }
  });

  it.each([
    ['without errorFallback', undefined],
    ['with errorFallback', Failed],
  ])(
    'calls each onError once for two boundaries on one failing handle, %s',
    async (_name, errorFallback) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await using ship = await Nexus.create([]);
      const section = lazySection('navigation', async () => {
        throw new Error('remote down');
      });
      const first = vi.fn();
      const second = vi.fn();
      const view = await mount(
        <Boundary>
          <NexusProvider container={ship}>
            <SectionBoundary
              section={section}
              errorFallback={errorFallback}
              onError={first}
            >
              <Heading />
            </SectionBoundary>
            <SectionBoundary
              section={section}
              errorFallback={errorFallback}
              onError={second}
            >
              <Heading />
            </SectionBoundary>
          </NexusProvider>
        </Boundary>,
      );
      if (errorFallback === undefined) await screen.findByRole('alert');
      else await screen.findAllByRole('button');
      await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
      view.unmount();
    },
  );

  it.each([
    ['without errorFallback', undefined],
    ['with errorFallback', Failed],
  ])(
    'clears a load that fails after its boundary unmounted, so a remount loads again, %s',
    async (_name, errorFallback) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await using ship = await Nexus.create([]);
      let calls = 0;
      let rejectFirst: (error: unknown) => void = () => undefined;
      const section = lazySection('navigation', () => {
        calls += 1;
        if (calls > 1) return Promise.resolve(Navigation);
        return new Promise<ModuleRef>((_, reject) => {
          rejectFirst = reject;
        });
      });
      const onError = vi.fn();
      const tree = (show: boolean) => (
        <Boundary>
          <NexusProvider container={ship}>
            {show ? (
              <SectionBoundary
                section={section}
                errorFallback={errorFallback}
                onError={onError}
                fallback={<p>Loading</p>}
              >
                <Heading />
              </SectionBoundary>
            ) : (
              <p>elsewhere</p>
            )}
          </NexusProvider>
        </Boundary>
      );
      const view = await mount(tree(true));
      await screen.findByText('Loading');
      await remount(view, tree(false));
      await act(async () => rejectFirst(new Error('remote down')));
      await remount(view, tree(true));
      expect(await screen.findByText('42')).toBeTruthy();
      expect(calls).toBe(2);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toMatchObject({
        section: 'navigation',
      });
      view.unmount();
    },
  );

  it('clears a retried load that fails after its boundary unmounted, so a remount loads again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    let calls = 0;
    let rejectSecond: (error: unknown) => void = () => undefined;
    const section = lazySection('navigation', () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('remote down'));
      if (calls === 2)
        return new Promise<ModuleRef>((_, reject) => {
          rejectSecond = reject;
        });
      return Promise.resolve(Navigation);
    });
    const onError = vi.fn();
    const tree = (show: boolean) => (
      <NexusProvider container={ship}>
        {show ? (
          <SectionBoundary
            section={section}
            errorFallback={Failed}
            onError={onError}
            fallback={<p>Loading</p>}
          >
            <Heading />
          </SectionBoundary>
        ) : (
          <p>elsewhere</p>
        )}
      </NexusProvider>
    );
    const view = await mount(tree(true));
    const button = await screen.findByRole('button');
    await act(async () => button.click());
    await screen.findByText('Loading');
    expect(calls).toBe(2);
    await remount(view, tree(false));
    await act(async () => rejectSecond(new Error('still down')));
    await remount(view, tree(true));
    expect(await screen.findByText('42')).toBeTruthy();
    expect(calls).toBe(3);
    expect(onError).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it.each([
    ['without errorFallback', false],
    ['with errorFallback', true],
  ])(
    'reports one failure once while a transition is held by a suspending sibling, %s',
    async (_name, withFallback) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await using ship = await Nexus.create([]);
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let loads = 0;
      const section = lazySection('navigation', () => {
        loads += 1;
        const attempt = loads;
        return new Promise<ModuleRef>((resolve, reject) =>
          setTimeout(
            () =>
              attempt === 1
                ? reject(new Error('remote down'))
                : resolve(Navigation),
            20,
          ),
        );
      });
      const onError = vi.fn();
      const caught: unknown[] = [];
      let reset = () => undefined as void;
      class App extends Component<
        { children?: ReactNode },
        { error: unknown }
      > {
        override state: { error: unknown } = { error: null };
        static getDerivedStateFromError(error: unknown) {
          return { error };
        }
        override render() {
          reset = () => this.setState({ error: null });
          return this.state.error === null ? (
            this.props.children
          ) : (
            <p>app-error</p>
          );
        }
      }
      const held = new Promise<void>((resolve) => setTimeout(resolve, 150));
      function Held() {
        use(held);
        return null;
      }
      const FallbackView = () => <em>section-fallback</em>;
      const page = (route: 'home' | 'ship') => (
        <NexusProvider container={ship}>
          <App>
            <Suspense fallback={<i>outer-loading</i>}>
              {route === 'home' ? (
                <span>home</span>
              ) : (
                <>
                  <Held />
                  <SectionBoundary
                    section={section}
                    onError={onError}
                    errorFallback={withFallback ? FallbackView : undefined}
                    fallback={<i>loading</i>}
                  >
                    <Heading />
                  </SectionBoundary>
                </>
              )}
            </Suspense>
          </App>
        </NexusProvider>
      );
      const flags = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      const acting = flags.IS_REACT_ACT_ENVIRONMENT;
      flags.IS_REACT_ACT_ENVIRONMENT = false;
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host, {
        onCaughtError: (error) => caught.push(error),
      });
      try {
        root.render(page('home'));
        await waitFor(() => expect(host.textContent).toBe('home'));
        startTransition(() => root.render(page('ship')));
        await wait(400);
        expect(loads).toBe(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toMatchObject({
          section: 'navigation',
          cause: { message: 'remote down' },
        });
        expect(caught).toHaveLength(1);
        expect(caught[0]).toBe(onError.mock.calls[0]?.[0]);
        if (withFallback) {
          expect(host.textContent).toContain('section-fallback');
        } else {
          expect(host.textContent).toBe('app-error');
          reset();
          await waitFor(() => expect(host.textContent).toBe('42'), {
            timeout: 3000,
          });
          expect(loads).toBe(2);
          expect(onError).toHaveBeenCalledTimes(1);
        }
      } finally {
        flags.IS_REACT_ACT_ENVIRONMENT = acting;
        root.unmount();
        host.remove();
      }
    },
  );

  it('hands onError the SectionConflictError the fallback gets on a conflict', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    const { seen, Capture } = capture();
    const onError = vi.fn();
    const tree = (module: ModuleRef) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => module)}
          errorFallback={Capture}
          onError={onError}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree(Navigation));
    await screen.findByText('42');
    await remount(view, tree(Other));
    await screen.findByText('failed');
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    expect(onError).toHaveBeenCalledExactlyOnceWith(seen.error);
    view.unmount();
  });

  it('shows a BlueprintError from load() in errorFallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const CALLSIGN = new Token<string>('Callsign');
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: (callsign: string) => ({
            plot: (to: string) => ({ to, heading: callsign.length }),
          }),
          deps: [CALLSIGN],
        }),
      ],
      exports: [NAV_CHARTS],
    });
    const { seen, Capture } = capture();
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('broken', async () => Broken)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    await screen.findByText('failed');
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_FAILED')).toBe(true);
    expect(
      isNexusError((seen.error as Error).cause, 'NEXUS_BLUEPRINT_INVALID'),
    ).toBe(true);
    view.unmount();
  });

  it('sends a component error to the app boundary above', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    function Explodes(): null {
      throw new Error('panel fault');
    }
    const onError = vi.fn();
    const view = await mount(
      <Boundary>
        <NexusProvider container={ship}>
          <SectionBoundary
            section={lazySection('navigation', async () => Navigation)}
            errorFallback={Failed}
            onError={onError}
          >
            <Explodes />
          </SectionBoundary>
        </NexusProvider>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toBe('panel fault');
    expect(onError).not.toHaveBeenCalled();
    view.unmount();
  });

  it('extends live scopes before the section renders', async () => {
    const SCOPED_CHARTS = new Token<INavCharts>('ScopedCharts');
    const ScopedNavigation = defineModule({
      name: 'ScopedNavigation',
      providers: [
        provide(SCOPED_CHARTS, {
          useFactory: () => fakeCharts,
          lifetime: 'scoped',
        }),
      ],
      exports: [SCOPED_CHARTS],
    });
    function ScopedHeading() {
      return <p>{useService(SCOPED_CHARTS).plot('Kepler-442b').heading}</p>;
    }
    await using ship = await Nexus.create([]);
    const view = await mount(
      <NexusProvider container={ship}>
        <ScopeProvider>
          <SectionBoundary
            section={lazySection('navigation', async () => ScopedNavigation)}
          >
            <ScopedHeading />
          </SectionBoundary>
        </ScopeProvider>
      </NexusProvider>,
    );
    expect(await screen.findByText('42')).toBeTruthy();
    view.unmount();
  });

  it('does nothing for a new handle that returns the same module object', async () => {
    await using ship = await Nexus.create([]);
    const tree = () => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => Navigation)}
          fallback={<p>Loading</p>}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree());
    await screen.findByText('42');
    await remount(view, tree());
    expect(await screen.findByText('42')).toBeTruthy();
    view.unmount();
  });

  it('fails with NEXUS_REACT_SECTION_CONFLICT for two module names under one section name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    const { seen, Capture } = capture();
    const tree = (module: ModuleRef) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => module)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree(Navigation));
    await screen.findByText('42');
    await remount(view, tree(Other));
    await screen.findByText('failed');
    expect(isNexusError(seen.error, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    view.unmount();
  });

  it("sends a nested section's conflict to the app boundary, past the outer section", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    const bridge = lazySection('bridge', async () =>
      defineModule({ name: 'Bridge', providers: [] }),
    );
    const outerError = vi.fn();
    const OuterFallback = () => <p>outer-fallback</p>;
    const tree = (module: ModuleRef) => (
      <Boundary>
        <NexusProvider container={ship}>
          <SectionBoundary
            section={bridge}
            errorFallback={OuterFallback}
            onError={outerError}
          >
            <SectionBoundary
              section={lazySection('navigation', async () => module)}
            >
              <Heading />
            </SectionBoundary>
          </SectionBoundary>
        </NexusProvider>
      </Boundary>
    );
    const view = await mount(tree(Navigation));
    await screen.findByText('42');
    await remount(view, tree(Other));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REACT_SECTION_CONFLICT',
    );
    expect(outerError).not.toHaveBeenCalled();
    expect(screen.queryByText('outer-fallback')).toBeNull();
    view.unmount();
  });

  it('clears the errorFallback of one section when the boundary switches to another', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const broken = lazySection('cartography', async () => {
      throw new Error('remote down');
    });
    const navigation = lazySection('navigation', async () => Navigation);
    const tree = (section: typeof navigation) => (
      <NexusProvider container={ship}>
        <SectionBoundary section={section} errorFallback={Failed}>
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = await mount(tree(broken));
    expect((await screen.findByRole('button')).textContent).toBe('remote down');
    await remount(view, tree(navigation));
    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    view.unmount();
  });

  it('retries a conflict while the original handle still renders', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    const original = lazySection('navigation', async () => Navigation);
    const otherLoader = vi.fn(async () => Other);
    const other = lazySection('navigation', otherLoader);
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary section={original} fallback={<p>Loading</p>}>
          <Heading />
        </SectionBoundary>
        <SectionBoundary section={other} errorFallback={Failed}>
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    const button = await screen.findByRole('button');
    expect(button.textContent).toMatch(/NEXUS_REACT_SECTION_CONFLICT/);
    expect(screen.getByText('42')).toBeTruthy();
    await act(async () => button.click());
    await vi.waitFor(() => expect(otherLoader).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('button')).textContent).toMatch(
      /NEXUS_REACT_SECTION_CONFLICT/,
    );
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByText('Loading')).toBeNull();
    view.unmount();
  });

  it('loads once for two distinct handles that race the first load', async () => {
    const events: TraceEvent[] = [];
    await using ship = await Nexus.create([], {
      plugins: [trace((e) => events.push(e))],
    });
    const first = vi.fn(async () => Navigation);
    const second = vi.fn(async () => Navigation);
    const handles = [
      lazySection('navigation', first),
      lazySection('navigation', second),
    ];
    const tree = (
      <NexusProvider container={ship}>
        {handles.map((section, i) => (
          <SectionBoundary key={i} section={section} fallback={<p>Loading</p>}>
            <Heading />
          </SectionBoundary>
        ))}
      </NexusProvider>
    );
    const view = await mount(tree);
    expect(await screen.findAllByText('42')).toHaveLength(2);
    // A render of either handle reuses its entry: no loader runs again.
    await remount(view, tree);
    expect(screen.queryByText('Loading')).toBeNull();
    expect(loadEvents(events)).toBe(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe('SectionBoundary with @nexusdi/testing', () => {
  it('loads the stub of overrideModule with { lazy: true }', async () => {
    const Stub = defineModule({
      name: 'NavigationStub',
      providers: [
        provide(NAV_CHARTS, {
          useValue: { plot: (to) => ({ to, heading: 7 }) },
        }),
      ],
      exports: [NAV_CHARTS],
    });
    await using ship = await createTestingContainer(
      defineModule({ name: 'Meridian' }),
    )
      .overrideModule(Navigation, Stub, { lazy: true })
      .create();
    const view = await mount(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => Navigation)}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    expect(await screen.findByText('7')).toBeTruthy();
    view.unmount();
  });
});
