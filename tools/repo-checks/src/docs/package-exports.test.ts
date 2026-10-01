import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { FIXTURES } from './paths';
import {
  readConstStrings,
  readLiteralUnion,
  readPackageExports,
} from './package-exports';

const PACKAGE = join(FIXTURES, 'package-exports', 'package.fixture.json');
const INDEX = join(FIXTURES, 'package-exports', 'src', 'index.ts');

describe('readPackageExports', () => {
  it('reads every entry of the exports map through the @nexusdi/source condition', () => {
    const exports = readPackageExports(PACKAGE);
    expect([...exports.keys()]).toEqual(['@fixture/pkg']);
    expect(exports.get('@fixture/pkg')).toEqual([
      { name: 'BaseError', callable: true, typeOnly: false, error: true },
      { name: 'ChildError', callable: true, typeOnly: false, error: true },
      { name: 'Code', callable: false, typeOnly: true, error: false },
      { name: 'CODES', callable: false, typeOnly: false, error: false },
      { name: 'Engine', callable: true, typeOnly: false, error: false },
      { name: 'LIMIT', callable: false, typeOnly: false, error: false },
      { name: 'run', callable: true, typeOnly: false, error: false },
      { name: 'Shape', callable: false, typeOnly: true, error: false },
    ]);
  });

  it('reads @nexusdi/core', () => {
    const core = readPackageExports(
      join(workspaceRoot, 'libs/core/package.json'),
    ).get('@nexusdi/core');
    expect(core?.find((entry) => entry.name === 'Nexus')).toMatchObject({
      callable: true,
      error: false,
    });
  });
});

describe('readConstStrings and readLiteralUnion', () => {
  it('reads an `as const` string array', () => {
    expect(readConstStrings(INDEX, 'CODES')).toEqual(['first', 'second']);
  });

  it('reads a union of string literals', () => {
    expect(readLiteralUnion(INDEX, 'Code')).toEqual(['x', 'y']);
  });

  it('returns null for a name the module does not export', () => {
    expect(readConstStrings(INDEX, 'MISSING')).toBeNull();
    expect(readLiteralUnion(INDEX, 'Missing')).toBeNull();
  });
});
