import { describe, expect, it } from 'vitest';

import { all, isModifier, lazy, optional } from './modifiers.js';
import { MultiToken, Token } from './token.js';

const LINK = new Token<string>('SubspaceLink');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

describe('optional', () => {
  it('wraps a token in a frozen optional modifier', () => {
    const dep = optional(LINK);
    expect(dep).toEqual({ kind: 'optional', token: LINK });
    expect(Object.isFrozen(dep)).toBe(true);
  });
});

describe('lazy', () => {
  it('wraps a token in a frozen lazy modifier', () => {
    expect(lazy(LINK)).toEqual({ kind: 'lazy', token: LINK });
  });
});

describe('all', () => {
  it('wraps a MultiToken in a frozen all modifier', () => {
    expect(all(DIAGNOSTICS)).toEqual({ kind: 'all', token: DIAGNOSTICS });
  });
});

describe('isModifier', () => {
  it('recognises only modifiers the modifier functions made', () => {
    expect(isModifier(optional(LINK))).toBe(true);
    expect(isModifier({ kind: 'optional', token: LINK })).toBe(false);
    expect(isModifier(LINK)).toBe(false);
    expect(isModifier(null)).toBe(false);
  });
});
