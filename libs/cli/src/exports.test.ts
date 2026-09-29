import { describe, expect, it } from 'vitest';

import { parseEntryRef } from './entry.js';
import { pickExport } from './exports.js';

const Meridian = { name: 'Meridian' };

describe('pickExport', () => {
  it('returns the named export', () => {
    expect(
      pickExport({ Meridian }, parseEntryRef('src/m.ts#Meridian', '/w')),
    ).toBe(Meridian);
  });

  it('returns the default export when no name is given', () => {
    expect(
      pickExport({ default: Meridian }, parseEntryRef('src/m.ts', '/w')),
    ).toBe(Meridian);
  });

  it('lists the exports when there is no default', () => {
    let error: unknown;
    try {
      pickExport(
        { Meridian, COMMS_OPTIONS: 1 },
        parseEntryRef('src/m.ts', '/w'),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      exitCode: 2,
      message: 'src/m.ts has no default export.',
      fix: 'Its exports: Meridian, COMMS_OPTIONS\n  Pass one: nexusdi graph src/m.ts#Meridian',
    });
  });

  it('names a missing named export', () => {
    expect(() =>
      pickExport({ Meridian }, parseEntryRef('src/m.ts#Science', '/w')),
    ).toThrow('src/m.ts has no export named Science.');
  });

  it('repeats the flag a --load or --plugins ref came from', () => {
    let error: unknown;
    try {
      pickExport(
        { notArray: {}, plugins: [] },
        parseEntryRef('plugins.js', '/w'),
        { via: '--plugins', fits: Array.isArray },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      exitCode: 2,
      fix: 'Its exports: notArray, plugins\n  Pass one: --plugins plugins.js#plugins',
    });
  });
});
