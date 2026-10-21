import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub } from 'react-router';
import type { Nexus } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';

import { BridgeClient } from '../../app/bridge/bridge.client';
import Charts from '../../app/routes/charts';

const built: Nexus[] = [];
afterEach(() =>
  Promise.all(built.splice(0).map((s) => s[Symbol.asyncDispose]())),
);

async function client() {
  const ship = await createTestingContainer(BridgeClient).create();
  built.push(ship);
  const Stub = createRoutesStub([{ path: '/charts', Component: Charts }]);
  return (
    <NexusProvider container={ship}>
      <Stub initialEntries={['/charts']} />
    </NexusProvider>
  );
}

describe('the charts route', () => {
  it('renders the boundary fallback on the server', async () => {
    const html = renderToString(await client());
    expect(html).toContain('Unrolling the star map');
    expect(html).not.toContain('heading 42');
  });

  it('renders StarMap once the section loads in the browser', async () => {
    const page = await client();
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
