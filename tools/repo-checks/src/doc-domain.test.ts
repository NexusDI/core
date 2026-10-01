import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkDomain, domainHits } from './docs/doc-domain';
import { loadRegionExpander, readExpandedSite } from './docs/loaders';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ALLOWANCE = join(import.meta.dirname, 'doc-domain-allowance.json');
const ROOT = join(FIXTURES, 'doc-domain');

async function tree(name: string) {
  const expandRegions = await loadRegionExpander();
  const root = join(ROOT, name);
  return readSite(join(root, 'content'), {
    transform: (source, file) => expandRegions(source, root, file),
  });
}

describe('doc-domain fixtures', () => {
  it('passes a clean tree, an exempt Migration page and a pre-0.4.0 post included', async () => {
    expect(checkDomain(await tree('clean'), {})).toEqual([]);
  });

  it('finds every 0.3 name in the fences, the expanded region included', async () => {
    const tokens = (await tree('sabotaged')).find(
      (page) => page.slug === 'tokens',
    );
    expect(domainHits(tokens!).sort()).toEqual([
      '@Service',
      'AppModule',
      'DynamicModule',
      'IUserService',
      'UserService',
      'new Nexus()',
    ]);
  });

  it('fails the count against the ratchet', async () => {
    expect(checkDomain(await tree('sabotaged'), {})).toEqual([
      'tokens: 6 names from the 0.3 site in fences (@Service, AppModule, DynamicModule, IUserService, UserService, new Nexus()), allowance 0. Set the example on the Starship Meridian (spec section 7), or mark a Migration page domainExempt.',
    ]);
  });

  it('fails an allowance above the count, and one for a page that is gone', async () => {
    expect(checkDomain(await tree('clean'), { tokens: 1, gone: 2 })).toEqual([
      'doc-domain-allowance.json: gone has no page. Remove the entry.',
      'doc-domain-allowance.json: tokens: 0, allowance 1. Lower the entry to the count, and remove it at zero.',
    ]);
  });
});

describe('doc-domain on apps/docs', () => {
  it('holds', async () => {
    expect(
      checkDomain(
        await readExpandedSite(CONTENT),
        readAllowance<Record<string, number>>(ALLOWANCE),
      ),
    ).toEqual([]);
  });
});
