import { describe, expect, it } from 'vitest';

import { provide, readProvider } from './provide.js';
import { Token } from './token.js';

describe('provide', () => {
  it('returns a frozen opaque object that carries its token and options', () => {
    const NAME = new Token<string>('Name');
    const options = { useValue: 'Meridian' };
    const provider = provide(NAME, options);

    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.keys(provider)).toEqual([]);
    expect(readProvider(provider)).toEqual({ token: NAME, options });
  });

  it('records no options for provide(C)', () => {
    class Beacon {}
    expect(readProvider(provide(Beacon))).toEqual({
      token: Beacon,
      options: undefined,
    });
  });
});

describe('readProvider', () => {
  it('reads nothing from a value provide() did not return', () => {
    expect(
      readProvider({ token: new Token<string>('Name'), useValue: 'x' }),
    ).toBeUndefined();
    expect(readProvider(null)).toBeUndefined();
    expect(readProvider(undefined)).toBeUndefined();
  });
});
