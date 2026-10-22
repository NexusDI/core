import { describe, expect, it } from 'vitest';

import { listInWords } from './list-in-words';

describe('listInWords', () => {
  it.each([
    [[], ''],
    [['bridge'], 'bridge'],
    [['bridge', 'habitat'], 'bridge and habitat'],
    [['bridge', 'habitat', 'airlock'], 'bridge, habitat and airlock'],
    [
      ['bridge', 'habitat', 'reactor-bay', 'airlock'],
      'bridge, habitat, reactor-bay and airlock',
    ],
  ])('writes %o as %o', (names, words) => {
    expect(listInWords(names)).toBe(words);
  });
});
