import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Nexus,
  defineModule,
  isNexusError,
  provide,
  type Token,
} from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';
import { describe, expect, it } from 'vitest';

import {
  COMMAND_LINK,
  NAV_CHARTS,
  STATION_TELEMETRY,
  type ICommandLink,
  type INavCharts,
  type IStationTelemetry,
} from './index.js';
import { MERIDIAN_CONTRACT_VERSION } from './version.js';

const charts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const telemetry: IStationTelemetry = {
  subscribe: () => () => undefined,
  state: () => ({ status: 'offline', reading: null }),
};
const link: ICommandLink = {
  send: async () => ({ queued: false, text: 'offline' }),
};

/** A shell that provides the contract's three tokens at `version`. */
const shellAt = (version: string) => {
  const contract = defineContract({ key: 'meridian', version });
  const navCharts = contract.token<INavCharts>('NavCharts');
  const stationTelemetry =
    contract.token<IStationTelemetry>('StationTelemetry');
  const commandLink = contract.token<ICommandLink>('CommandLink');
  return defineModule({
    name: 'Tactical',
    providers: [
      provide(navCharts, { useValue: charts }),
      provide(stationTelemetry, { useValue: telemetry }),
      provide(commandLink, { useValue: link }),
    ],
    exports: [navCharts, stationTelemetry, commandLink],
  });
};

/** A remote module whose class depends on this package's NAV_CHARTS. */
class SectorRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}
const Cartography = defineModule({
  name: 'Cartography',
  providers: [SectorRoutes],
});

/** A remote module whose one class depends on `token`. */
function stationOn(token: Token<unknown>) {
  class Station {
    static deps = [token] as const;
    constructor(readonly dependency: unknown) {}
  }
  return defineModule({ name: 'Station', providers: [Station] });
}

/**
 * The errors `Nexus.check` reports for a shell at `version` that loads
 * `remote` with its Tactical in the load imports, as the shell loads a station.
 */
function checkAgainst(version: string, remote = Cartography): unknown[] {
  const tactical = shellAt(version);
  const root = defineModule({ name: 'Meridian', imports: [tactical] });
  try {
    Nexus.check(root, {
      plugins: [federation()],
      load: [{ module: remote, imports: [tactical] }],
    });
  } catch (error) {
    if (isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
      return [...error.errors];
    throw error;
  }
  return [];
}

describe('the meridian contract', () => {
  it('describes NAV_CHARTS as meridian/NavCharts', () => {
    expect(NAV_CHARTS.description).toBe('meridian/NavCharts');
  });

  it('is at version 2.4.0', () => {
    expect(MERIDIAN_CONTRACT_VERSION).toBe('2.4.0');
  });

  it('binds NAV_CHARTS to a provider of key meridian at 2.4.0', () => {
    expect(checkAgainst('2.4.0')).toEqual([]);
  });

  it('marks NAV_CHARTS with version 2.4.0, which a 2.3.0 provider fails', () => {
    const errors = checkAgainst('2.3.0');
    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(isNexusError(error, 'NEXUS_CONTRACT_VERSION')).toBe(true);
    expect(error).toMatchObject({
      contract: 'meridian/NavCharts',
      required: '2.4.0',
      provided: '2.3.0',
    });
  });

  it.each([
    { token: NAV_CHARTS, description: 'meridian/NavCharts' },
    { token: STATION_TELEMETRY, description: 'meridian/StationTelemetry' },
    { token: COMMAND_LINK, description: 'meridian/CommandLink' },
  ])(
    'describes $description and needs a 2.4.0 provider',
    ({ token, description }) => {
      expect(token.description).toBe(description);
      const errors = checkAgainst('2.3.0', stationOn(token));
      expect(errors).toHaveLength(1);
      const [error] = errors;
      expect(isNexusError(error, 'NEXUS_CONTRACT_VERSION')).toBe(true);
      expect(error).toMatchObject({
        contract: description,
        required: '2.4.0',
        provided: '2.3.0',
      });
    },
  );
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

/** The file a subpath of this package's `exports` names for a bundler. */
function exported(subpath: string): string {
  const entry = manifest.exports[subpath];
  return resolve(root, typeof entry === 'string' ? entry : entry.default);
}

/** Every file of `dist` the built `.` entry reaches, by its imports. */
function reachedFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf-8');
    for (const [, specifier] of source.matchAll(
      /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g,
    )) {
      if (specifier.startsWith('.'))
        queue.push(resolve(dirname(file), specifier));
      else if (specifier.startsWith(`${manifest.name}/`))
        queue.push(exported(`.${specifier.slice(manifest.name.length)}`));
    }
  }
  return [...seen];
}

describe('the built . entry', () => {
  const entry = exported('.');

  it('exists, since the test target builds the package first', () => {
    expect(existsSync(entry)).toBe(true);
  });

  it('reaches no part of the ./shared build config', () => {
    const reached = reachedFrom(entry);
    expect(reached).toContain(exported('./version'));
    expect(reached).not.toContain(exported('./shared'));
  });
});
