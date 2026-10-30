import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import {
  checkOptionKeys,
  optionKeyId,
  readOptionKeys,
} from './docs/doc-option-keys';
import { FIXTURES } from './docs/paths';
import {
  ERROR_EXEMPT,
  readReferenceSite,
  surfacePackageOf,
  surfacePackages,
} from './docs/reference-site';
import { readSite, type DocsPage } from './docs/site';

/**
 * Every key of an options type is named on its package's reference page,
 * under the heading of the export that takes it. `docs/doc-option-keys.ts`
 * defines an options type, a key and what naming one is.
 */

const FIXTURE = join(FIXTURES, 'doc-option-keys');

const tree = (name: string): DocsPage[] =>
  readSite(join(FIXTURE, name, 'content'));

const X = surfacePackageOf(join(FIXTURE, 'package.fixture.json'));

const fixture = (name: string) =>
  readOptionKeys(workspaceRoot, tree(name), [X], new Map());

const ALLOWANCE = join(import.meta.dirname, 'doc-option-keys-allowance.json');

type Allowance = Record<string, { unnamed: string[] }>;

const PAGE =
  'tools/repo-checks/src/__fixtures__/docs/doc-option-keys/clean/content/api-x.mdx';

describe('readOptionKeys', () => {
  it('owes each key under the heading of every export that takes it, and under its own type', () => {
    expect(fixture('clean')).toEqual([
      {
        name: '@nexusdi/x',
        page: PAGE,
        keys: [
          expect.objectContaining({ via: 'Dock#open', named: true }),
          expect.objectContaining({ heading: 'launch', named: true }),
          expect.objectContaining({ heading: 'launch', named: true }),
          expect.objectContaining({ heading: 'LaunchOptions', named: true }),
          expect.objectContaining({ heading: 'LaunchOptions', named: true }),
        ],
      },
    ]);
    expect(fixture('clean')[0]?.keys.map(optionKeyId)).toEqual([
      'Dock: Dock#open(options).bay',
      'launch: LaunchOptions.countdown',
      'launch: LaunchOptions.crew',
      'LaunchOptions: LaunchOptions.countdown',
      'LaunchOptions: LaunchOptions.crew',
    ]);
  });

  it('counts no key above a cut, in bare prose, or in a literal the checker does not hold to the type', () => {
    expect(
      fixture('sabotaged')[0]
        ?.keys.filter((each) => !each.named)
        .map(optionKeyId),
    ).toEqual(['Dock: Dock#open(options).bay', 'launch: LaunchOptions.crew']);
  });
});

describe('checkOptionKeys', () => {
  it('passes a clean tree', () => {
    expect(
      checkOptionKeys({ packages: fixture('clean'), allowance: {} }),
    ).toEqual([]);
  });

  it.each([
    "@nexusdi/x: 'crew', a key of LaunchOptions that launch takes, is not named under '## `launch`' in api-x.mdx",
    "@nexusdi/x: 'bay', a key of Dock#open(options) that Dock#open takes, is not named under '## `Dock`' in api-x.mdx",
  ])('fails the sabotaged tree: %s', (phrase) => {
    const findings = checkOptionKeys({
      packages: fixture('sabotaged'),
      allowance: {},
    });
    expect(findings).toHaveLength(2);
    expect(findings.some((finding) => finding.includes(phrase))).toBe(true);
  });

  it('passes the sabotaged tree with each gap in the allowance', () => {
    expect(
      checkOptionKeys({
        packages: fixture('sabotaged'),
        allowance: {
          '@nexusdi/x': {
            unnamed: [
              'Dock: Dock#open(options).bay',
              'launch: LaunchOptions.crew',
            ],
          },
        },
      }),
    ).toEqual([]);
  });

  it('fails an allowance entry that is no longer needed', () => {
    expect(
      checkOptionKeys({
        packages: fixture('clean'),
        allowance: {
          '@nexusdi/x': { unnamed: ['launch: LaunchOptions.crew'] },
        },
      }),
    ).toEqual([
      '@nexusdi/x: "launch: LaunchOptions.crew" is named now, or no key by that name is owed; remove it from doc-option-keys-allowance.json',
    ]);
  });

  it('fails an allowance entry for a package with no reference page', () => {
    expect(
      checkOptionKeys({
        packages: fixture('clean'),
        allowance: { '@nexusdi/y': { unnamed: [] } },
      }),
    ).toEqual([
      'doc-option-keys-allowance.json names @nexusdi/y, which is no library with a reference page; remove the entry',
    ]);
  });

  it('keeps the allowance sorted, so a diff reads as one line', () => {
    const allowance = readAllowance<Allowance>(ALLOWANCE);
    const keys = Object.keys(allowance);

    expect(keys).toEqual([...keys].sort());
    for (const [name, entry] of Object.entries(allowance))
      expect(entry.unnamed, `${name} is out of order`).toEqual(
        [...entry.unnamed].sort(),
      );
  });

  it('holds on apps/docs', async () => {
    expect(
      checkOptionKeys({
        packages: readOptionKeys(
          workspaceRoot,
          await readReferenceSite((page) => page.kind === 'reference'),
          await surfacePackages(),
          ERROR_EXEMPT,
        ),
        allowance: readAllowance<Allowance>(ALLOWANCE),
      }),
    ).toEqual([]);
  }, 180_000);
});
