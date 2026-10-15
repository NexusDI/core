import {
  defineModule,
  Nexus,
  provide,
  Token,
  type ModuleRef,
  type Scope,
} from '@nexusdi/core';
import { act, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { html } from '../test-support/html.js';
import * as clientApi from './index.js';
import { Boundary } from '../test-support/boundary.js';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

/** Both graphs bind FLIGHT_LOG to a log whose first entry is the same. */
class ShuttleFlightLog implements IFlightLog {
  readonly #entries = ['rendered on the server'];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
// Scoped on the server, a singleton in the client graph (react spec 9.1).
const BridgeServer = defineModule({
  name: 'BridgeServer',
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
const BridgeClient = defineModule({
  name: 'BridgeClient',
  providers: [provide(FLIGHT_LOG, { useClass: ShuttleFlightLog })],
  exports: [FLIGHT_LOG],
});

interface INavCharts {
  heading(): number;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useValue: { heading: () => 42 } })],
  exports: [NAV_CHARTS],
});

type Api = typeof import('./index.js');

/**
 * The page, built from one copy of the package. The server render takes its
 * own copy: in one process, the server and client renderers would otherwise
 * share the package's context object, which React refuses.
 */
function page(api: Api, ship: Nexus, scope?: Scope) {
  const { NexusProvider, ScopeProvider, SectionBoundary, useService } = api;
  const navigation = api.lazySection(
    'navigation',
    async (): Promise<ModuleRef> => Navigation,
  );
  function Log({ id }: { id: string }) {
    return <p id={id}>{useService(FLIGHT_LOG).entries()[0]}</p>;
  }
  function Heading() {
    return <p>heading {useService(NAV_CHARTS).heading()}</p>;
  }
  return {
    Log,
    full: (
      <NexusProvider container={ship} scope={scope}>
        <Log id="course" />
        <ScopeProvider fallback={<p>Docking</p>}>
          <Log id="docked" />
        </ScopeProvider>
        <SectionBoundary section={navigation} fallback={<p>Loading section</p>}>
          <Heading />
        </SectionBoundary>
        <NexusProvider
          container={ship}
          clientOnly
          fallback={<p>Console skeleton</p>}
        >
          <Log id="console" />
        </NexusProvider>
      </NexusProvider>
    ),
  };
}

/** The package as a separate module graph, for the server render. */
async function serverCopy(): Promise<Api> {
  vi.resetModules();
  return import('./index.js');
}

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('hydration', () => {
  it('hydrates server HTML rendered with the request scope, with no error or mismatch', async () => {
    await using server = await Nexus.create(BridgeServer);
    await using scope = await server.createScope({ request: {} as never });
    const markup = await html(page(await serverCopy(), server, scope).full);
    expect(markup).toContain('rendered on the server');
    expect(markup).toContain('Docking');
    expect(markup).toContain('Loading section');
    expect(markup).toContain('Console skeleton');

    await using client = await Nexus.create(BridgeClient);
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);
    const errors = vi.spyOn(console, 'error');
    const recoverable = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, page(clientApi, client).full, {
        onRecoverableError: recoverable,
      });
    });

    expect(await screen.findByText('heading 42')).toBeTruthy();
    expect(document.querySelector('#course')?.textContent).toBe(
      'rendered on the server',
    );
    expect(document.querySelector('#docked')?.textContent).toBe(
      'rendered on the server',
    );
    expect(document.querySelector('#console')?.textContent).toBe(
      'rendered on the server',
    );
    expect(screen.queryByText('Docking')).toBeNull();
    expect(screen.queryByText('Console skeleton')).toBeNull();
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('gives the hydration render NEXUS_SCOPE_REQUIRED when the client graph binds the token scoped', async () => {
    await using server = await Nexus.create(BridgeServer);
    await using scope = await server.createScope({ request: {} as never });
    const serverApi = await serverCopy();
    const ServerLog = page(serverApi, server).Log;
    const markup = await html(
      <serverApi.NexusProvider container={server} scope={scope}>
        <ServerLog id="course" />
      </serverApi.NexusProvider>,
    );
    const ClientLog = page(clientApi, server).Log;
    await using client = await Nexus.create(BridgeServer);
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      root = hydrateRoot(
        container,
        <Boundary>
          <clientApi.NexusProvider container={client}>
            <ClientLog id="course" />
          </clientApi.NexusProvider>
        </Boundary>,
        { onRecoverableError: () => undefined },
      );
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_SCOPE_REQUIRED',
    );
  });
});
