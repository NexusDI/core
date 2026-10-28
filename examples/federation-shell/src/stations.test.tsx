import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { EmitFilesPlugin } from '@nexusdi/federation-contracts/rspack';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@module-federation/runtime', () => ({
  registerRemotes: vi.fn(),
  loadRemote: vi.fn(),
}));

const { STATIONS, remoteEntry, stationAt, stationById } =
  await import('./stations');
const { Nav } = await import('./nav');
const { startRemotes } = await import('./mf');

const examples = resolve(import.meta.dirname, '../..');

/** What a remote's rspack config says about itself once rspack calls it. */
async function remoteConfig(id: string) {
  const file = resolve(examples, `federation-${id}`, 'rspack.config.ts');
  const { default: factory } = (await import(pathToFileURL(file).href)) as {
    default: (
      env: object,
      argv: { mode: string },
    ) => { devServer: { port: number }; output: { uniqueName: string } };
  };
  return factory({}, { mode: 'production' });
}

/** The shell's rspack config, as rspack renders it for a production build. */
async function shellConfig() {
  const file = resolve(import.meta.dirname, '../rspack.config.ts');
  const { default: factory } = (await import(pathToFileURL(file).href)) as {
    default: (env: object, argv: { mode: string }) => { plugins: unknown[] };
  };
  return factory({}, { mode: 'production' });
}

describe('the station table', () => {
  it('gives each station its own id, path, remote and port', () => {
    for (const key of ['id', 'path', 'remote', 'port'] as const)
      expect(new Set(STATIONS.map((station) => station[key])).size).toBe(
        STATIONS.length,
      );
  });

  it('finds the station of a path, and none for the bridge', () => {
    for (const station of STATIONS)
      expect(stationAt(station.path)).toBe(station);
    expect(stationAt('/')).toBeUndefined();
    expect(stationAt('/diagnostics')).toBeUndefined();
  });
});

describe('the nav', () => {
  it('lists the bridge, then one link per station in table order', () => {
    render(<Nav diagnostics={false} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Bridge',
      ...STATIONS.map((station) => station.label),
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      ...STATIONS.map((station) => station.path),
    ]);
    expect(screen.getAllByRole('listitem')).toHaveLength(links.length);
  });

  it('adds the diagnostics link last when the build has devtools', () => {
    render(<Nav diagnostics />);

    const links = screen.getAllByRole('link');
    expect(links.at(-1)?.textContent).toBe('Diagnostics');
    expect(links.at(-1)?.getAttribute('href')).toBe('/diagnostics');
  });
});

describe('the remotes', () => {
  it('registers the remote of every row and marks the others failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );

    const started = await startRemotes();
    vi.unstubAllGlobals();

    expect(Object.keys(started)).toEqual(
      STATIONS.map((station) => station.remote),
    );
  });

  it('emits the development remote list from the rows, with no checked-in copy', async () => {
    const config = await shellConfig();
    const emitted = config.plugins.find(
      (plugin): plugin is EmitFilesPlugin => plugin instanceof EmitFilesPlugin,
    );

    expect(JSON.parse(emitted?.files['remotes.json'] ?? 'null')).toEqual(
      STATIONS.map((station) => ({
        name: station.remote,
        entry: `http://localhost:${station.port}/remoteEntry.js`,
      })),
    );
    expect(
      existsSync(resolve(import.meta.dirname, '../public/remotes.json')),
    ).toBe(false);
  });

  it('names the remote entry of a row on its port plus an offset', () => {
    const [row] = STATIONS;

    expect(stationById(row.id)).toBe(row);
    expect(remoteEntry(row, '127.0.0.1', 30)).toEqual({
      name: row.remote,
      entry: `http://127.0.0.1:${row.port + 30}/remoteEntry.js`,
    });
  });

  it.each(STATIONS.map((station) => [station.id, station] as const))(
    'builds %s under the name and port of its row',
    async (id, station) => {
      const config = await remoteConfig(id);

      expect(config.output.uniqueName).toBe(station.remote);
      expect(config.devServer.port).toBe(station.port);
    },
  );
});
