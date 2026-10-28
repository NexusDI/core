import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { splitLoadEntry } from './load-entry.js';

const Engineering = defineModule({ name: 'Engineering' });
const Survey = defineModule({ name: 'Survey' });

describe('splitLoadEntry', () => {
  it('returns a module ref as the module with no grant', () => {
    expect(splitLoadEntry(Survey)).toEqual({ module: Survey, imports: [] });
  });

  it('returns the module and the granted modules of a { module, imports } entry', () => {
    const entry = { module: Survey, imports: [Engineering] };
    const { module, imports } = splitLoadEntry(entry);
    expect(module).toBe(Survey);
    expect(imports).toEqual([Engineering]);
  });

  it.each([
    ['a string', 'Survey'],
    ['an empty object', {}],
    ['null', null],
    ['an object whose imports is not an array', { module: Survey, imports: 1 }],
  ])('returns %s as the module, so load() reports it', (_label, value) => {
    expect(splitLoadEntry(value as never)).toEqual({
      module: value,
      imports: [],
    });
  });
});
