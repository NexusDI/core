import { act, screen } from '@testing-library/react';
import { NexusProvider } from '@nexusdi/react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub } from 'react-router';
import { describe, expect, vi } from 'vitest';

import Charts from '../../app/routes/charts';
import { test } from '../support/console';

describe('the charts route', () => {
  test('renders the boundary fallback on the server', async ({
    nexus,
    openScope,
  }) => {
    // The server graph and a request scope, as entry.server.tsx renders.
    const scope = await openScope({ mission: 'survey-9' });
    const Stub = createRoutesStub([{ path: '/charts', Component: Charts }]);
    const html = renderToString(
      <NexusProvider container={nexus} scope={scope}>
        <Stub initialEntries={['/charts']} />
      </NexusProvider>,
    );
    expect(html).toContain('Unrolling the star map');
    expect(html).not.toContain('heading 42');
  });

  test('renders StarMap once the section loads in the browser', async ({
    renderRoute,
  }) => {
    // The chunk is in Vite's module graph before the render, so the
    // boundary's import resolves inside the first act().
    await import('../../app/sections/cartography');
    await act(async () => {
      await renderRoute({ default: Charts }, { path: '/charts' });
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
    expect(screen.getByText('Proxima-b: heading 117')).toBeDefined();
    expect(screen.getByText('TRAPPIST-1e: heading 203')).toBeDefined();
  });
});
