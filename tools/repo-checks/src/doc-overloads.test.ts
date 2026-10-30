import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import {
  checkOverloads,
  normalizeSignature,
  readOverloads,
} from './docs/doc-overloads';
import { FIXTURES } from './docs/paths';
import {
  ERROR_EXEMPT,
  readReferenceSite,
  surfacePackageOf,
  surfacePackages,
} from './docs/reference-site';
import { readSite } from './docs/site';

/**
 * Every overload of an exported callable is called, on its package's
 * reference page, by a fence the repository compiles or runs, and the type
 * checker resolves that call to the overload. `docs/doc-overloads.ts`
 * defines an overload, its key and what calling one is.
 */

const FIXTURE = join(FIXTURES, 'doc-overloads');

const X = surfacePackageOf(join(FIXTURE, 'package.fixture.json'));

const fixture = (name: string) =>
  readOverloads(
    workspaceRoot,
    readSite(join(FIXTURE, name, 'content')),
    [X],
    new Map(),
  );

const ALLOWANCE = join(import.meta.dirname, 'doc-overloads-allowance.json');

type Allowance = Record<string, { unexercised: string[] }>;

const PING_ALL = 'ping(beacons: readonly Beacon[]): string[]';
const SEND_ALL = 'Relay#send(to: readonly string[]): number';

describe('normalizeSignature', () => {
  it.each([
    [
      'a type literal with and without its last semicolon',
      '(shape: { a: string; b: number; }): void',
      '(shape: { a: string; b: number }): void',
    ],
    [
      'type parameters on one line and wrapped with a trailing comma',
      `<
  T,
  R extends PromiseLike<T>,
>(token: T): R`,
      '<T, R extends PromiseLike<T>>(token: T): R',
    ],
    [
      'parameters wrapped with a trailing comma',
      `(
  token: Token<T>,
  options?: { readonly module?: ModuleRef },
): T`,
      '(token: Token<T>, options?: { readonly module?: ModuleRef }): T',
    ],
  ])('reads %s as one key', (_, wrapped, flat) => {
    expect(normalizeSignature(wrapped)).toBe(normalizeSignature(flat));
    expect(normalizeSignature(flat)).toBe(flat);
  });
});

describe('readOverloads', () => {
  it('keys every overload of an overloaded callable by its label and declaration', () => {
    expect(fixture('clean')).toEqual([
      {
        name: '@nexusdi/x',
        page: 'tools/repo-checks/src/__fixtures__/docs/doc-overloads/clean/content/api-x.mdx',
        overloads: [
          { key: PING_ALL, exercised: true },
          { key: 'ping(name: string): string', exercised: true },
          { key: SEND_ALL, exercised: true },
          { key: 'Relay#send(to: string): number', exercised: true },
        ],
      },
    ]);
  });

  it('counts no call above a cut, with a compile error, or in a fence that does not run', () => {
    expect(
      fixture('sabotaged')[0]?.overloads.filter((each) => !each.exercised),
    ).toEqual([
      { key: PING_ALL, exercised: false },
      { key: SEND_ALL, exercised: false },
    ]);
  });
});

describe('checkOverloads', () => {
  it('passes a clean tree', () => {
    expect(
      checkOverloads({ packages: fixture('clean'), allowance: {} }),
    ).toEqual([]);
  });

  it.each([PING_ALL, SEND_ALL])('fails the sabotaged tree: %s', (key) => {
    const findings = checkOverloads({
      packages: fixture('sabotaged'),
      allowance: {},
    });
    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual(
      `@nexusdi/x: no twoslash fence, file= fence or reference example= region on api-x.mdx calls the overload ${key}. A reader of that entry sees no example of it; add a call the compiler resolves to it, or record it in doc-overloads-allowance.json.`,
    );
  });

  it('passes the sabotaged tree with each gap in the allowance', () => {
    expect(
      checkOverloads({
        packages: fixture('sabotaged'),
        allowance: { '@nexusdi/x': { unexercised: [PING_ALL, SEND_ALL] } },
      }),
    ).toEqual([]);
  });

  it('fails an allowance entry that is no longer needed', () => {
    expect(
      checkOverloads({
        packages: fixture('clean'),
        allowance: { '@nexusdi/x': { unexercised: [PING_ALL] } },
      }),
    ).toEqual([
      `@nexusdi/x: the overload ${PING_ALL} is called now, or is no overload; remove it from doc-overloads-allowance.json`,
    ]);
  });

  it('fails an allowance entry for a package with no reference page', () => {
    expect(
      checkOverloads({
        packages: fixture('clean'),
        allowance: { '@nexusdi/y': { unexercised: [] } },
      }),
    ).toEqual([
      'doc-overloads-allowance.json names @nexusdi/y, which is no library with a reference page; remove the entry',
    ]);
  });

  it('keeps the allowance sorted, so a diff reads as one line', () => {
    const allowance = readAllowance<Allowance>(ALLOWANCE);
    const keys = Object.keys(allowance);

    expect(keys).toEqual([...keys].sort());
    for (const [name, entry] of Object.entries(allowance))
      expect(entry.unexercised, `${name} is out of order`).toEqual(
        [...entry.unexercised].sort(),
      );
  });

  it('holds on apps/docs', async () => {
    expect(
      checkOverloads({
        packages: readOverloads(
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
