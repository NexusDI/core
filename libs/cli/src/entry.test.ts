import { describe, expect, it } from 'vitest';

import { CliError } from './cli-error.js';
import { entryKind, parseEntryRef } from './entry.js';

const CWD = '/work/app';

describe('parseEntryRef', () => {
  it('splits path and export at the last #', () => {
    expect(parseEntryRef('src/meridian.module.ts#Meridian', CWD)).toEqual({
      path: '/work/app/src/meridian.module.ts',
      exportName: 'Meridian',
      shown: 'src/meridian.module.ts',
    });
  });

  it('takes the default export when there is no #', () => {
    expect(parseEntryRef('src/app.js', CWD).exportName).toBeNull();
  });

  it('rejects a trailing # with exit 2', () => {
    const error = catchError(() => parseEntryRef('src/app.ts#', CWD));
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({ exitCode: 2 });
  });

  it('rejects a reference with no file with exit 2', () => {
    expect(catchError(() => parseEntryRef('#Meridian', CWD))).toMatchObject({
      exitCode: 2,
    });
  });
});

describe('entryKind', () => {
  it.each([
    ['a.ts', 'ts'],
    ['a.mts', 'ts'],
    ['a.cts', 'ts'],
    ['a.js', 'js'],
    ['a.mjs', 'js'],
    ['a.cjs', 'js'],
    ['a.json', 'json'],
  ] as const)('reads %s as %s', (file, kind) => {
    expect(entryKind(parseEntryRef(file, CWD))).toBe(kind);
  });

  it('rejects another extension with exit 2', () => {
    expect(
      catchError(() => entryKind(parseEntryRef('a.tsx', CWD))),
    ).toMatchObject({
      exitCode: 2,
    });
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}
