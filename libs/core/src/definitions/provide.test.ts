import { describe, expect, it } from 'vitest';

import { defineModule, Nexus } from '../index.js';
import { provide, readProvider } from './provide.js';
import { Token } from './token.js';

describe('provide', () => {
  it('returns a frozen object with no own keys', () => {
    const provider = provide(new Token<string>('Name'), {
      useValue: 'Meridian',
    });

    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.keys(provider)).toEqual([]);
  });

  it('registers its token with the options it was given', async () => {
    const NAME = new Token<string>('Name');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [provide(NAME, { useValue: 'Meridian' })],
      }),
    );

    expect(ship.get(NAME)).toBe('Meridian');
  });

  it('registers the class itself for provide(C)', async () => {
    class Beacon {}
    const ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [provide(Beacon)] }),
    );

    expect(ship.get(Beacon)).toBeInstanceOf(Beacon);
  });
});

describe('readProvider', () => {
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

  it('reads nothing from a value provide() did not return', () => {
    expect(
      readProvider({ token: new Token<string>('Name'), useValue: 'x' }),
    ).toBeUndefined();
    expect(readProvider(null)).toBeUndefined();
    expect(readProvider(undefined)).toBeUndefined();
  });
});
