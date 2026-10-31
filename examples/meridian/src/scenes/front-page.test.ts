import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlueprintError, Nexus } from '@nexusdi/core';
import { inspect } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { SEED, amend, rootOf } from './front-page.ts';

const HERE = import.meta.dirname;

/** The code of the region `meridian` in `pages/index.md`. */
function regionCode(): string {
  const text = readFileSync(join(HERE, '../pages/index.md'), 'utf8');
  const region =
    /<!-- #region meridian -->([\s\S]*?)<!-- #endregion meridian -->/;
  const fence = /```ts @import\.meta\.vitest[^\n]*\n([\s\S]*?)\n```/;
  const code = fence.exec(region.exec(text)?.[1] ?? '')?.[1];
  if (code === undefined) throw new Error('region meridian not found');
  return code;
}

/**
 * The region as a module that exports its root. The program's own run (the
 * `Nexus.create` and the claims after it) is cut off, since this test reads
 * the graph. The file sits beside this one, so the workspace packages
 * resolve as they do for the region.
 */
async function regionRoot(): Promise<Parameters<typeof inspect>[0]> {
  const code = regionCode();
  const cut = code.indexOf('const ship = await Nexus.create');
  if (cut < 0) throw new Error('region meridian has no Nexus.create');
  const dir = mkdtempSync(join(HERE, '.region-'));
  try {
    const file = join(dir, 'region.ts');
    writeFileSync(file, `${code.slice(0, cut)}\nexport { Meridian };\n`);
    const loaded = (await import(/* @vite-ignore */ file)) as {
      Meridian: Parameters<typeof inspect>[0];
    };
    return loaded.Meridian;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the front-page scene', () => {
  it('builds the graph of the region meridian from the seed', async () => {
    expect(inspect(rootOf(SEED))).toEqual(inspect(await regionRoot()));
  });

  it('passes the check on the seed', () => {
    expect(() =>
      Nexus.check(rootOf(SEED), { plugins: [errors()] }),
    ).not.toThrow();
  });

  it('builds a fresh root on every call', () => {
    expect(rootOf(SEED)).not.toBe(rootOf(SEED));
  });

  it('imports Comms once, whatever the number of importers', () => {
    const graph = inspect(rootOf(SEED));
    expect(graph.modules.filter((each) => each.name === 'Comms')).toHaveLength(
      1,
    );
  });

  it('drops the import a cut conduit names', () => {
    const cut = amend(SEED, { conduits: { 'Tactical>Comms': false } });
    const tactical = inspect(rootOf(SEED)).modules.find(
      (m) => m.name === 'Tactical',
    );
    expect(tactical?.imports).toHaveLength(2);
    let thrown: unknown;
    try {
      Nexus.check(rootOf(cut), { plugins: [errors()] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BlueprintError);
    const [entry] = (thrown as BlueprintError).errors;
    expect(entry).toMatchObject({
      module: 'Tactical',
      nearMisses: [{ kind: 'not-imported', module: 'Comms' }],
    });
  });
});
