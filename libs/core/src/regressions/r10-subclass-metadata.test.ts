import { describe, expect, it } from 'vitest';

import { readInjectable, readProps } from '../definitions/metadata.js';
import { Inject, Injectable, Module, Nexus, Token, provide } from '../index.js';

describe('R10', () => {
  it("leaves the parent's metadata unchanged when a subclass is decorated", async () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');

    @Injectable({ deps: [A] })
    class Parent {
      @Inject(A) accessor a!: string;
      constructor(readonly first: string) {}
    }
    @Injectable({ deps: [B] })
    class Child extends Parent {
      @Inject(B) accessor b!: string;
    }

    expect(readInjectable(Parent)?.deps).toEqual([A]);
    expect(readProps(Parent).map((p) => p.key)).toEqual(['a']);
    expect(readProps(Child).map((p) => p.key)).toEqual(['a', 'b']);

    @Module({
      providers: [
        provide(A, { useValue: 'alpha' }),
        provide(B, { useValue: 'beta' }),
        Parent,
        Child,
      ],
    })
    class Hangar {}
    const ship = await Nexus.create(Hangar);
    expect(ship.get(Parent)).toMatchObject({ first: 'alpha', a: 'alpha' });
    expect(ship.get(Child)).toMatchObject({
      first: 'beta',
      a: 'alpha',
      b: 'beta',
    });
  });
});
