import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { checkErrorCodes, codesByPackage } from './docs/doc-error-codes';
import { CONTENT, FIXTURES } from './docs/paths';
import { readSite } from './docs/site';

const ROOT = join(FIXTURES, 'doc-error-codes');
const ALLOWANCE = join(import.meta.dirname, 'doc-error-codes-allowance.json');
const tree = (name: string) => readSite(join(ROOT, name, 'content'));
const fixtureCodes = () => codesByPackage(join(ROOT, 'libs'), 'manifest.json');
const at = (path: string) =>
  `tools/repo-checks/src/__fixtures__/docs/doc-error-codes/sabotaged/content/${path}`;

describe('codesByPackage', () => {
  it('reads every NexusErrorByCode key outside the tests, with its package', () => {
    expect([...fixtureCodes()].sort()).toEqual([
      ['NEXUS_CACHE_STORE', '@fixture/cache'],
      ['NEXUS_DISPOSED', '@fixture/core'],
      ['NEXUS_MISSING_PROVIDER', '@fixture/core'],
    ]);
  });

  it('finds the 40 codes the packages declare at the rc.0 tag', () => {
    const codes = codesByPackage(join(workspaceRoot, 'libs'));
    expect(codes.size).toBeGreaterThanOrEqual(40);
    expect(codes.get('NEXUS_MISSING_PROVIDER')).toBe('@nexusdi/core');
    expect(codes.get('NEXUS_INTERCEPTOR_MISSING')).toBe(
      '@nexusdi/interceptors',
    );
  });
});

describe('doc-error-codes fixtures', () => {
  it('passes a clean tree', () => {
    expect(
      checkErrorCodes({
        pages: tree('clean'),
        codes: fixtureCodes(),
        allowance: {},
      }),
    ).toEqual([]);
  });

  it('fails a missing page, a wrong package, an undeclared code and an unlinked code', () => {
    expect(
      checkErrorCodes({
        pages: tree('sabotaged'),
        codes: fixtureCodes(),
        allowance: { NEXUS_CACHE_STORE: 'Phase 1 writes it.' },
      }),
    ).toEqual([
      'apps/docs/content/errors/NEXUS_DISPOSED.mdx: @fixture/core declares NEXUS_DISPOSED, which has no page. Every error message links to /errors/NEXUS_DISPOSED (spec section 3.3).',
      `${at('api-errors.mdx')}: links no page for NEXUS_GHOST. List every code page.`,
      `${at('errors/NEXUS_GHOST.mdx')}: NEXUS_GHOST is declared by no package under libs/. Remove the page, or declare the code in NexusErrorByCode.`,
      `${at('errors/NEXUS_MISSING_PROVIDER.mdx')}: package '@fixture/cache', and @fixture/core declares NEXUS_MISSING_PROVIDER. Name the declaring package.`,
    ]);
  });

  it('fails an allowance entry whose page exists', () => {
    expect(
      checkErrorCodes({
        pages: tree('clean'),
        codes: fixtureCodes(),
        allowance: { NEXUS_DISPOSED: 'Phase 1 writes it.' },
      }),
    ).toEqual([
      "doc-error-codes-allowance.json: 'NEXUS_DISPOSED' exists now. Remove the entry.",
    ]);
  });
});

describe('doc-error-codes on apps/docs', () => {
  it('holds', () => {
    expect(
      checkErrorCodes({
        pages: readSite(CONTENT),
        codes: codesByPackage(join(workspaceRoot, 'libs')),
        allowance: readAllowance<Record<string, string>>(ALLOWANCE),
      }),
    ).toEqual([]);
  });
});
