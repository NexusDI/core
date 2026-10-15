import { describe, expect, it } from 'vitest';

import { readLibraries } from './libraries.ts';

const { libraries } = readLibraries();

describe('libraries.json scale fields', () => {
  it('gives every library the module form its renderer uses', () => {
    expect(
      Object.fromEntries(libraries.map((l) => [l.id, l.moduleForm])),
    ).toEqual({
      nexusdi: 'modules',
      inversify: 'container-modules',
      tsyringe: 'registry',
      awilix: 'registration-functions',
      'needle-di': 'registration-functions',
    });
  });

  it('notes the departure of registration functions, and only that one', () => {
    for (const lib of libraries)
      if (lib.moduleForm === 'registration-functions')
        expect(lib.moduleNote, lib.id).toMatch(/\S/);
      else expect(lib.moduleNote, lib.id).toBeUndefined();
  });

  it('gives tsyringe and awilix the reason they have no async factory', () => {
    const reasons = Object.fromEntries(
      libraries.map((l) => [l.id, l.notApplicable['async-factory']]),
    );
    expect(reasons.tsyringe).toMatch(/\S/);
    expect(reasons.awilix).toMatch(/\S/);
    for (const id of ['nexusdi', 'inversify', 'needle-di'])
      expect(reasons[id], id).toBeUndefined();
  });

  it('cites a page for the module form and, where it applies, the async factory', () => {
    for (const lib of libraries) {
      const forms = lib.claims.flatMap((c) =>
        c.form === undefined ? [] : [c.form],
      );
      expect(forms, lib.id).toContain('module');
      if (lib.notApplicable['async-factory'] === undefined)
        expect(forms, lib.id).toContain('async-factory');
      else expect(forms, lib.id).not.toContain('async-factory');
      for (const c of lib.claims.filter((c) => c.form !== undefined))
        expect(c.source, `${lib.id}: ${c.claim}`).toMatch(/^https:\/\//);
    }
  });

  it('cites a page for the alias form of every library, checked against its pin', () => {
    for (const lib of libraries) {
      const claim = lib.claims.find((c) => c.form === 'alias');
      expect(claim, lib.id).toBeDefined();
      expect(claim?.source, lib.id).toMatch(/^https:\/\//);
      expect(claim?.verifiedAgainst, lib.id).toBe(lib.version);
    }
  });
});
