import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Nexus, defineModule, isNexusError, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';
import { describe, expect, it } from 'vitest';

import { NAV_CHARTS, type INavCharts } from './index.js';
import { MERIDIAN_CONTRACT_VERSION } from './version.js';

const charts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

/** A shell that provides the contract's NavCharts at `version`. */
const shellAt = (version: string) => {
  const token = defineContract({ key: 'meridian', version }).token<INavCharts>(
    'NavCharts',
  );
  return defineModule({
    name: 'Tactical',
    providers: [provide(token, { useValue: charts })],
    exports: [token],
    global: true,
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

/** The errors `Nexus.check` reports for a shell at `version` and this remote. */
async function checkAgainst(version: string): Promise<unknown[]> {
  const root = defineModule({
    name: 'Meridian',
    imports: [shellAt(version), Cartography],
  });
  try {
    await Nexus.check(root, { plugins: [federation()] });
  } catch (error) {
    return (error as { errors: unknown[] }).errors;
  }
  return [];
}

describe('the meridian contract', () => {
  it('describes NAV_CHARTS as meridian/NavCharts', () => {
    expect(NAV_CHARTS.description).toBe('meridian/NavCharts');
  });

  it('is at version 2.3.0', () => {
    expect(MERIDIAN_CONTRACT_VERSION).toBe('2.3.0');
  });

  it('binds NAV_CHARTS to a provider of key meridian at 2.3.0', async () => {
    expect(await checkAgainst('2.3.0')).toEqual([]);
  });

  it('marks NAV_CHARTS with version 2.3.0, which a 2.2.0 provider fails', async () => {
    const errors = await checkAgainst('2.2.0');
    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(isNexusError(error, 'NEXUS_CONTRACT_VERSION')).toBe(true);
    expect(error).toMatchObject({
      contract: 'meridian/NavCharts',
      required: '2.3.0',
      provided: '2.2.0',
    });
  });
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
