import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import { surfaceProgram } from './docs/api-surface';
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

const fixtureKeys = () => readOptionKeys(surfaceProgram([X]), [X], new Map());

const ALLOWANCE = join(import.meta.dirname, 'doc-option-keys-allowance.json');

type Allowance = Record<string, { unnamed: string[] }>;

describe('readOptionKeys', () => {
  it('owes each key under the heading of every export that takes it, and under its own type', () => {
    expect(fixtureKeys()).toEqual([
      {
        name: '@nexusdi/x',
        keys: [
          expect.objectContaining({ heading: 'Dock', via: 'Dock#open' }),
          expect.objectContaining({ heading: 'launch', key: 'countdown' }),
          expect.objectContaining({ heading: 'launch', key: 'crew' }),
          expect.objectContaining({
            heading: 'LaunchOptions',
            key: 'countdown',
          }),
          expect.objectContaining({ heading: 'LaunchOptions', key: 'crew' }),
        ],
      },
    ]);
    expect(fixtureKeys()[0]?.keys.map(optionKeyId)).toEqual([
      'Dock: Dock#open(options).bay',
      'launch: LaunchOptions.countdown',
      'launch: LaunchOptions.crew',
      'LaunchOptions: LaunchOptions.countdown',
      'LaunchOptions: LaunchOptions.crew',
    ]);
  });
});

describe('checkOptionKeys', () => {
  it('passes a clean tree', () => {
    expect(
      checkOptionKeys({
        pages: tree('clean'),
        packages: fixtureKeys(),
        allowance: {},
      }),
    ).toEqual([]);
  });

  it.each([
    "@nexusdi/x: 'crew', a key of LaunchOptions that launch takes, is not named under '## `launch`' in api-x.mdx",
    "@nexusdi/x: 'bay', a key of Dock#open(options) that Dock#open takes, is not named under '## `Dock`' in api-x.mdx",
  ])('fails the sabotaged tree: %s', (phrase) => {
    const findings = checkOptionKeys({
      pages: tree('sabotaged'),
      packages: fixtureKeys(),
      allowance: {},
    });
    expect(findings).toHaveLength(2);
    expect(findings.some((finding) => finding.includes(phrase))).toBe(true);
  });

  it('passes the sabotaged tree with each gap in the allowance', () => {
    expect(
      checkOptionKeys({
        pages: tree('sabotaged'),
        packages: fixtureKeys(),
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
        pages: tree('clean'),
        packages: fixtureKeys(),
        allowance: {
          '@nexusdi/x': { unnamed: ['launch: LaunchOptions.crew'] },
        },
      }),
    ).toEqual([
      expect.stringContaining(
        '"launch: LaunchOptions.crew" is named now, or no key by that name is owed; remove it from doc-option-keys-allowance.json',
      ),
    ]);
  });

  it('fails an allowance entry for a package with no reference page', () => {
    expect(
      checkOptionKeys({
        pages: tree('clean'),
        packages: fixtureKeys(),
        allowance: { '@nexusdi/y': { unnamed: [] } },
      }),
    ).toEqual([
      expect.stringContaining(
        'doc-option-keys-allowance.json names @nexusdi/y, which is no library with a reference page',
      ),
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
    const packages = await surfacePackages();
    expect(
      checkOptionKeys({
        pages: await readReferenceSite((page) => page.kind === 'reference'),
        packages: readOptionKeys(
          surfaceProgram(packages),
          packages,
          ERROR_EXEMPT,
        ),
        allowance: readAllowance<Allowance>(ALLOWANCE),
      }),
    ).toEqual([]);
  }, 180_000);
});
