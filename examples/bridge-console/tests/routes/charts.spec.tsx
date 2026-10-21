import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub } from 'react-router';
import type { Nexus } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeClient } from '../../app/bridge/bridge.client';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { fakeBridgeLink } from '../doubles';
import Charts from '../../app/routes/charts';

const built: Nexus[] = [];
afterEach(() =>
  Promise.all(built.splice(0).map((s) => s[Symbol.asyncDispose]())),
);

const Stub = createRoutesStub([{ path: '/charts', Component: Charts }]);

async function client() {
  const ship = await createTestingContainer(BridgeClient).create();
  built.push(ship);
  return (
    <NexusProvider container={ship}>
      <Stub initialEntries={['/charts']} />
    </NexusProvider>
  );
}

describe('the charts route', () => {
  it('renders the boundary fallback on the server', async () => {
    // The server graph and a request scope, as entry.server.tsx renders.
    const ship = await createTestingContainer(BridgeConsole)
      .override(BRIDGE_LINK, fakeBridgeLink)
      .create();
    built.push(ship);
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-9', target: 'Kepler-442b' } },
    });
    const html = renderToString(
      <NexusProvider container={ship} scope={scope}>
        <Stub initialEntries={['/charts']} />
      </NexusProvider>,
    );
    expect(html).toContain('Unrolling the star map');
    expect(html).not.toContain('heading 42');
  });

  it('renders StarMap once the section loads in the browser', async () => {
    const page = await client();
    // The chunk is in Vite's module graph before the render, so the
    // boundary's import resolves inside the first act().
    await import('../../app/sections/cartography');
    await act(async () => {
      render(page);
    });
    // The section's chunk is a dynamic import, and React commits the render
    // the boundary suspends on inside act(), so each poll runs one.
    await vi.waitFor(
      async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        screen.getByText('Kepler-442b: heading 42');
      },
      { timeout: 5_000 },
    );
    expect(screen.queryByText('Unrolling the star map')).toBeNull();
  });
});
