import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { schematicMarkup } from '../seed-ship';
import { seedInitial } from './seed-bay';
import PreflightBay from './PreflightBay';

// Vitest gives a static image import as a path and Next as an object with its
// size, so the test stands in for the module that reads that object.
vi.mock('../art', () => ({
  FRAME: [-5, -1.5, 80, 20],
  cutawayBase: (sizes: string) => ({
    src: '/art.webp',
    width: 2048,
    height: 512,
    sources: [],
    sizes,
  }),
  sideBase: () => ({ src: '/art.webp', width: 2048, height: 512 }),
}));

class Observer {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function bay() {
  return render(
    <PreflightBay markup={schematicMarkup()} initial={seedInitial()} />,
  );
}

const part = (id: string) => {
  const found = document.querySelector(`[data-bay-part="${id}"]`);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

describe('the pre-flight bay controller', () => {
  it('opens on the lit seed with a passing check and an open Launch', () => {
    bay();
    expect(
      screen
        .getByRole('button', { name: 'Launch' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    expect(
      screen.getByRole('log', { name: 'preflight.ts' }).textContent,
    ).toContain('pre-flight ok');
  });

  it('queues the check of a first press under "Running pre-flight", then fails it', async () => {
    bay();
    fireEvent.click(part('conduit-Tactical-Comms'));
    expect(screen.getAllByText('Running pre-flight').length).toBeGreaterThan(0);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('NEXUS_MISSING_PROVIDER')).toBeTruthy();
    expect(alert.textContent).toContain(
      'NavCharts (provider) in Tactical (module) cannot reach SubspaceLink',
    );
    const launch = screen.getByRole('button', { name: 'Launch' });
    expect(launch.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById('bay-launch-reason')?.textContent).toBe(
      'Launch is locked until the check passes',
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Check failed: 1 error',
    );
  });

  it('applies the fix the near miss names, and the check passes', async () => {
    bay();
    fireEvent.click(part('conduit-Tactical-Comms'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apply the fix' }),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(
      screen
        .getByRole('button', { name: 'Launch' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Check passed');
  });

  it('passes the check with the chart server unreachable and fails the launch', async () => {
    bay();
    fireEvent.click(part('chart-server'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Check passed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(within(alert).getByText('NEXUS_PROVIDER_FAILED')).toBeTruthy();
    expect(
      screen.getByRole('log', { name: 'preflight.ts' }).textContent,
    ).toContain('chart server unreachable');
    expect(
      document.querySelector('.nexus-bay__caption')?.textContent,
    ).toContain('Nexus.check passed: the wiring is right.');
  });

  it('closes the DRONE hatch, passes the check and fails the bridge lookup after Launch', async () => {
    bay();
    fireEvent.click(part('hatch-SurveyDrone'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Check passed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(within(alert).getByText('NEXUS_NOT_VISIBLE')).toBeTruthy();
    expect(
      document.querySelector('.nexus-bay__caption')?.textContent,
    ).toContain('which no check sees');
  });

  it('keeps a Switch for every part in hull order and outlines a focused one on the ship', async () => {
    const { container } = bay();
    const switches = [
      ...container.querySelectorAll('.nexus-bay__switches input'),
    ];
    expect(switches).toHaveLength(19);
    const first = switches[0] as HTMLElement;
    fireEvent.focus(first.closest('li') as HTMLElement);
    expect(container.querySelector('.is-outlined')).toBeTruthy();
    fireEvent.click(first);
    await screen.findByRole('status');
  });

  it('draws the graph over the ship without changing its state', async () => {
    const { container } = bay();
    fireEvent.click(screen.getByRole('switch', { name: /Show the graph/ }));
    await waitFor(() =>
      expect(container.querySelector('.bay-graph')).toBeTruthy(),
    );
    expect(container.querySelector('.nexus-bay__stage.is-graph')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
