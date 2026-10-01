import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import {
  checkInterfaceFirst,
  interfaceFirstHits,
} from './docs/doc-interface-first';
import { readExpandedSite } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ALLOWANCE = join(
  import.meta.dirname,
  'doc-interface-first-allowance.json',
);
const tree = (name: string) =>
  readSite(join(FIXTURES, 'doc-interface-first', name, 'content'));
const at =
  'tools/repo-checks/src/__fixtures__/docs/doc-interface-first/sabotaged/content/providers.mdx';

describe('interfaceFirstHits', () => {
  it('accepts tokens, modifiers, contract tokens and data in strings', () => {
    expect(
      interfaceFirstHits(
        "provide(DRONE, { useClass: ScoutDrone, deps: [COMPUTER, optional(SUBSPACE_LINK)] });\nconst s = 'deps: [FusionReactor]';",
      ),
    ).toEqual([]);
  });

  it('names a class token, a camelCase literal token and a class dep', () => {
    expect(
      interfaceFirstHits(
        'provide(FusionReactor, {}); ({ token: shipComputer, useClass: QuantumComputer }); static deps = [FusionReactor] as const;',
      ),
    ).toEqual([
      'provide(FusionReactor',
      'token: shipComputer',
      'deps entry FusionReactor',
    ]);
  });
});

describe('doc-interface-first fixtures', () => {
  it('passes a clean tree, getting-started included', async () => {
    expect(checkInterfaceFirst(await tree('clean'))).toEqual([]);
  });

  it('fails each class binding outside a skipped fence', async () => {
    expect(checkInterfaceFirst(await tree('sabotaged'))).toEqual([
      `${at}:8: binds a class where an interface token belongs (provide(FusionReactor, token: shipComputer, deps entry FusionReactor). Fences with a hit: 1, allowance 0. Give the service an interface and a Token<IFoo>, bind the class with useClass, and list tokens in deps (spec section 7.3).`,
    ]);
  });

  it('passes the sabotaged tree inside its allowance, and fails a stale one', async () => {
    expect(
      checkInterfaceFirst(await tree('sabotaged'), { providers: 1 }),
    ).toEqual([]);
    expect(
      checkInterfaceFirst(await tree('clean'), { providers: 1, gone: 1 }),
    ).toEqual([
      'doc-interface-first-allowance.json: gone has no page. Remove the entry.',
      'doc-interface-first-allowance.json: providers: 0, allowance 1. Lower the entry to the count, and remove it at zero.',
    ]);
  });
});

describe('doc-interface-first on apps/docs', () => {
  it('holds after region expansion', async () => {
    expect(
      checkInterfaceFirst(
        await readExpandedSite(CONTENT),
        readAllowance<Record<string, number>>(ALLOWANCE),
      ),
    ).toEqual([]);
  });
});
