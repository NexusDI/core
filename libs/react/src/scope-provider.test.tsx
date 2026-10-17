import {
  defineModule,
  MultiToken,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type Scope,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { act, render, screen } from '@testing-library/react';
import * as React from 'react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  lazySection,
  NestedScopeError,
  NexusProvider,
  react,
  ScopeProvider,
  SectionBoundary,
  useContainer,
  useService,
} from './index.js';
import { Boundary } from '../test-support/boundary.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<{ sectors: readonly string[] }>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const survey: NexusRequest = {
  mission: { id: 'survey-7', target: 'Kepler-442b' },
} as never;

function shipWith(events: TraceEvent[]) {
  return Nexus.create(
    [
      provide(MISSION, {
        useFactory: (request: NexusRequest) =>
          (request as unknown as { mission: Mission }).mission,
        deps: [REQUEST],
        lifetime: 'scoped',
      }),
      provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    ],
    { plugins: [trace((event) => events.push(event))] },
  );
}

function LogPanel() {
  const log = useService(FLIGHT_LOG);
  log.record('arrived');
  return <p>{log.entries()[0]}</p>;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const count = (events: TraceEvent[], type: string) =>
  events.filter((e) => e.type === type).length;

afterEach(() => vi.restoreAllMocks());

describe('ScopeProvider', () => {
  it('renders fallback, then the subtree with its own scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey} fallback={<p>Docking</p>}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    expect(screen.getByText('Docking')).toBeTruthy();
    expect(await screen.findByText('survey-7: arrived')).toBeTruthy();
    view.unmount();
  });

  it('keeps one scope through StrictMode and disposes it on unmount', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey} fallback={<p>Docking</p>}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    await screen.findByText(/survey-7/);
    await tick();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(0);
    view.unmount();
    await tick();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('gives two sibling providers two scopes', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <LogPanel />
          </ScopeProvider>
          <ScopeProvider request={survey}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    expect(await screen.findAllByText('survey-7: arrived')).toHaveLength(2);
    expect(count(events, 'scope:create')).toBe(2);
    view.unmount();
  });

  it('reads request once, so a new object makes no new scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const tree = (request: NexusRequest, key = 'survey') => (
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider key={key} request={request}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>
    );
    const view = render(tree(survey));
    await screen.findByText(/survey-7/);
    view.rerender(
      tree({ mission: { id: 'survey-8', target: 'Kepler-442b' } } as never),
    );
    await tick();
    expect(count(events, 'scope:create')).toBe(1);
    view.unmount();
  });

  it('throws a rejected createScope to the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <Boundary>
          <NexusProvider container={ship}>
            <ScopeProvider fallback={<p>Docking</p>}>
              <LogPanel />
            </ScopeProvider>
          </NexusProvider>
        </Boundary>
      </StrictMode>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REQUEST_MISSING',
    );
    view.unmount();
  });

  it('throws NEXUS_REACT_NESTED_SCOPE under a scope after hydration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <Boundary>
          <NexusProvider container={ship}>
            <ScopeProvider request={survey}>
              <ScopeProvider request={survey}>
                <LogPanel />
              </ScopeProvider>
            </ScopeProvider>
          </NexusProvider>
        </Boundary>
      </StrictMode>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REACT_NESTED_SCOPE',
    );
    expect(NestedScopeError).toBeDefined();
    view.unmount();
  });

  it('extends a live scope when a section loads, so section tokens resolve', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [
        provide(NAV_ROUTES, {
          useFactory: () => ({ sectors: ['alpha'] }),
          lifetime: 'scoped',
        }),
      ],
      exports: [NAV_ROUTES],
    });
    const navigation = lazySection('navigation', async () => Navigation);
    function Routes() {
      return <p>{useService(NAV_ROUTES).sectors.join(',')}</p>;
    }
    const tree = (section: boolean) => (
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <LogPanel />
            {section && (
              <SectionBoundary section={navigation}>
                <Routes />
              </SectionBoundary>
            )}
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>
    );
    const view = render(tree(false));
    await screen.findByText(/survey-7/);
    await act(async () => view.rerender(tree(true)));
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(count(events, 'scope:extend')).toBe(1); // no NEXUS_LOADED_AFTER_SCOPE
    view.unmount();
  });

  it('makes a new scope when a key remounts it', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const tree = (id: string) => (
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider
            key={id}
            request={{ mission: { id, target: 'Kepler-442b' } } as never}
          >
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>
    );
    const view = render(tree('survey-7'));
    await screen.findByText('survey-7: arrived');
    view.rerender(tree('survey-8'));
    expect(await screen.findByText('survey-8: arrived')).toBeTruthy();
    await tick();
    expect(count(events, 'scope:create')).toBe(2);
    expect(count(events, 'scope:dispose')).toBe(1);
    view.unmount();
  });

  it('gives the subtree the scope, the root to useContainer and a memo per scope', async () => {
    const events: TraceEvent[] = [];
    const ROUTES = new MultiToken<string>('Routes');
    await using ship = await Nexus.create(
      [
        provide(MISSION, {
          useFactory: (request: NexusRequest) =>
            (request as unknown as { mission: Mission }).mission,
          deps: [REQUEST],
          lifetime: 'scoped',
        }),
        provide(ROUTES, { useValue: 'alpha' }),
      ],
      { plugins: [trace((event) => events.push(event))] },
    );
    const seen: { root?: Nexus; routes: (readonly string[])[] } = {
      routes: [],
    };
    const record = (root: Nexus, routes: readonly string[]) => {
      seen.root = root;
      seen.routes.push(routes);
    };
    function Probe() {
      record(useContainer(), useService(ROUTES));
      return <p>{useService(MISSION).id}</p>;
    }
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <Probe />
          </ScopeProvider>
          <ScopeProvider request={survey}>
            <Probe />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    expect(await screen.findAllByText('survey-7')).toHaveLength(2);
    expect(seen.root).toBe(ship);
    // One array per scope: the two subtrees read separate memos.
    expect(new Set(seen.routes).size).toBe(2);
    view.unmount();
  });

  it('runs the transient check under a ScopeProvider', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const DRONE = new Token<{ launch(): string }>('SurveyDrone');
    await using ship = await Nexus.create(
      [
        provide(DRONE, {
          useFactory: () => ({ launch: () => 'scout' }),
          lifetime: 'transient',
        }),
      ],
      { plugins: [react()] },
    );
    function Drone() {
      return <p>{useService(DRONE).launch()}</p>;
    }
    const view = render(
      <StrictMode>
        <Boundary>
          <NexusProvider container={ship}>
            <ScopeProvider>
              <Drone />
            </ScopeProvider>
          </NexusProvider>
        </Boundary>
      </StrictMode>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REACT_TRANSIENT_IN_RENDER',
    );
    view.unmount();
  });

  it('hands a disposal error to reportError', async () => {
    const HATCH = new Token<AsyncDisposable>('Hatch');
    const reported = vi.fn();
    vi.stubGlobal('reportError', reported);
    await using ship = await Nexus.create([
      provide(HATCH, {
        useFactory: () => ({
          [Symbol.asyncDispose]: () =>
            Promise.reject(new Error('hatch jammed')),
        }),
        lifetime: 'scoped',
      }),
    ]);
    function Hatch() {
      useService(HATCH);
      return <p>open</p>;
    }
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider>
            <Hatch />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    await screen.findByText('open');
    view.unmount();
    await vi.waitFor(() => expect(reported).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });
});

// Two cases time the store's own extendAll against a scope's creation and its
// unmount, which no public call can order, so they sit off the ScopeProvider
// rail under the internal function they drive.
describe('storeFor', () => {
  it('extends a scope whose creation settles after the load', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [
        provide(NAV_ROUTES, {
          useFactory: () => ({ sectors: ['alpha'] }),
          lifetime: 'scoped',
        }),
      ],
      exports: [NAV_ROUTES],
    });
    function Routes() {
      return <p>{useService(NAV_ROUTES).sectors.join(',')}</p>;
    }
    const { storeFor } = await import('./store.js');
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <Routes />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    expect(storeFor(ship).pending.size).toBe(1);
    await ship.load(Navigation);
    await storeFor(ship).extendAll();
    expect(await screen.findByText('alpha')).toBeTruthy();
    view.unmount();
  });

  it('leaves the load resolved when a ScopeProvider unmounts while extendAll runs', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [
        provide(NAV_ROUTES, {
          useFactory: async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            return { sectors: ['alpha'] };
          },
          lifetime: 'scoped',
        }),
      ],
      exports: [NAV_ROUTES],
    });
    const { storeFor } = await import('./store.js');
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    await screen.findByText(/survey-7/);
    await ship.load(Navigation);
    const extended = storeFor(ship).extendAll();
    view.unmount();
    await tick();
    await expect(extended).resolves.toBeUndefined();
    expect(count(events, 'scope:dispose')).toBe(1);
  });
});

/** Activity arrived in React 19.2, and the peer floor is 19.0. */
const Activity = (
  React as unknown as {
    Activity?: (props: {
      mode: 'visible' | 'hidden';
      children?: ReactNode;
    }) => ReactNode;
  }
).Activity;

/** A createScope that settles when the test says so. */
function gateScopes(ship: Nexus) {
  const gates: {
    settle(): void;
    reject(error: unknown): void;
    promise: Promise<Scope>;
  }[] = [];
  const create = ship.createScope.bind(ship);
  vi.spyOn(ship, 'createScope').mockImplementation((options) => {
    const real = create(options);
    let settle!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Scope>((resolve, fail) => {
      settle = () => resolve(real);
      reject = fail;
    });
    gates.push({ settle, reject, promise });
    return promise;
  });
  return gates;
}

describe('ScopeProvider settle order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the scope of the current container when a replaced one settles last', async () => {
    const events: TraceEvent[] = [];
    await using shipA = await shipWith(events);
    await using shipB = await shipWith(events);
    const gatesA = gateScopes(shipA);
    const gatesB = gateScopes(shipB);
    const tree = (ship: Nexus) => (
      <NexusProvider container={ship}>
        <ScopeProvider request={survey} fallback={<p>Docking</p>}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>
    );
    const view = render(tree(shipA));
    await act(async () => undefined);
    view.rerender(tree(shipB)); // no macrotask yet, so A's disposal timer has not fired
    // B settles, then A settles, both before A's disposal timer fires.
    await act(async () => {
      gatesB[0].settle();
      await gatesB[0].promise;
      gatesA[0].settle();
      await gatesA[0].promise;
    });
    expect(screen.queryByText('Docking')).toBeNull();
    expect(screen.getByText(/survey-7/)).toBeTruthy();
    view.unmount();
    await tick();
  });

  it.skipIf(Activity === undefined)(
    'shows the fallback while a revealed Activity makes a new scope',
    async () => {
      if (Activity === undefined) return;
      const events: TraceEvent[] = [];
      await using ship = await shipWith(events);
      const tree = (mode: 'visible' | 'hidden', note: string): ReactNode => (
        <NexusProvider container={ship}>
          <Activity mode={mode}>
            <ScopeProvider request={survey} fallback={<p>Docking</p>}>
              <LogPanel />
              <span>{note}</span>
            </ScopeProvider>
          </Activity>
        </NexusProvider>
      );
      const view = render(tree('visible', 'one'));
      await screen.findByText(/survey-7/);
      view.rerender(tree('hidden', 'one'));
      await act(async () => tick()); // the hidden provider's scope is disposed
      const gates = gateScopes(ship);
      view.rerender(tree('visible', 'one'));
      await act(async () => undefined);
      expect(gates).toHaveLength(1);
      view.rerender(tree('visible', 'two')); // a render before the new scope settles
      await act(async () => undefined);
      expect(screen.getByText('Docking')).toBeTruthy();
      await act(async () => {
        gates[0].settle();
        await gates[0].promise;
      });
      expect(await screen.findByText(/survey-7/)).toBeTruthy();
      view.unmount();
      await tick();
    },
  );

  it('disposes a scope once when the provider unmounts before the create settles', async () => {
    const events: TraceEvent[] = [];
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await using ship = await shipWith(events);
    const gates = gateScopes(ship);
    const view = render(
      <NexusProvider container={ship}>
        <ScopeProvider request={survey}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>,
    );
    await act(async () => undefined);
    view.unmount();
    await act(async () => tick()); // the disposal timer fires with the create pending
    await act(async () => {
      gates[0].settle();
      await gates[0].promise;
    });
    await tick();
    expect(count(events, 'scope:dispose')).toBe(1);
    expect(errors).not.toHaveBeenCalled();
  });
});
