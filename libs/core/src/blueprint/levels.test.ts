import { describe, expect, it } from 'vitest';

import { idOf } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import { compile } from './compile.js';

class ReactorCore {}
class ShipComputer {
  constructor(readonly input: any) {}
}
class Bridge {
  constructor(readonly input: any) {}
}
class Probe {
  constructor(readonly input: any) {}
}

describe('compile', () => {
  it('puts a singleton one level above its highest singleton dep', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(Bridge, { deps: [ShipComputer] }),
          provide(ShipComputer, { deps: [ReactorCore] }),
          ReactorCore,
        ],
      }),
    });
    expect(bp.singletonLevels).toEqual([
      [idOf(bp, ReactorCore)],
      [idOf(bp, ShipComputer)],
      [idOf(bp, Bridge)],
    ]);
  });

  it('counts the singletons a transient reaches and ignores lazy edges', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          ReactorCore,
          provide(Probe, { deps: [ReactorCore], lifetime: 'transient' }),
          provide(ShipComputer, { deps: [Probe] }),
          provide(Bridge, { deps: [lazy(ShipComputer)] }),
        ],
      }),
    });
    expect(bp.singletonLevels).toEqual([
      [idOf(bp, ReactorCore), idOf(bp, Bridge)],
      [idOf(bp, ShipComputer)],
    ]);
  });

  it('leaves values, aliases and transients out of the singleton levels', () => {
    const NAME = new Token<string>('Name');
    const ALIAS = new Token<string>('Alias');
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(NAME, { useValue: 'x' }),
          provide(ALIAS, { useExisting: NAME }),
          provide(Probe, { deps: [NAME], lifetime: 'transient' }),
        ],
      }),
    });
    expect(bp.singletonLevels).toEqual([]);
  });

  it('levels scoped factories and the scoped providers they depend on', () => {
    const MISSION = new Token<string>('Mission');
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(ShipComputer, { deps: [REQUEST], lifetime: 'scoped' }),
          provide(MISSION, {
            useFactory: () => 'x',
            deps: [ShipComputer],
            lifetime: 'scoped',
          }),
          provide(Bridge, { deps: [MISSION], lifetime: 'scoped' }),
        ],
      }),
    });
    expect(bp.scopedLevels).toEqual([
      [idOf(bp, ShipComputer)],
      [idOf(bp, MISSION)],
    ]);
  });

  it('marks needsRequest and names the providers that depend on REQUEST', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(ShipComputer, { deps: [REQUEST], lifetime: 'scoped' }),
          provide(Bridge, { deps: [optional(REQUEST)], lifetime: 'scoped' }),
        ],
      }),
    });
    expect(bp.needsRequest).toBe(true);
    expect(bp.requestDependents).toEqual(['ShipComputer']);
  });

  it('does not need a request when REQUEST is only optional', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(Bridge, { deps: [optional(REQUEST)], lifetime: 'scoped' }),
        ],
      }),
    });
    expect(bp.needsRequest).toBe(false);
  });

  it('does not overflow the call stack on a long singleton chain', () => {
    const LENGTH = 20000;
    class Base {}
    const classes: (new (...args: any[]) => unknown)[] = [Base];
    for (let i = 1; i < LENGTH; i++) {
      class Link {
        constructor(readonly prev: unknown) {}
      }
      Object.defineProperty(Link, 'name', { value: `Link${i}` });
      classes.push(Link);
    }
    const providers = [
      Base,
      ...classes.slice(1).map((Cls, i) => provide(Cls, { deps: [classes[i]] })),
    ];
    const bp = compile({
      root: defineModule({ name: 'Root', providers }),
    });
    expect(bp.singletonLevels.length).toBe(LENGTH);
    expect(bp.singletonLevels[0]).toEqual([idOf(bp, Base)]);
    expect(bp.singletonLevels[LENGTH - 1]).toEqual([
      idOf(bp, classes[LENGTH - 1]),
    ]);
  });

  it('does not blow up on stacked transient diamonds under a scoped factory', () => {
    // Each layer fans a shared node out to two transients and back in to one:
    // Ni depends on [Ai, Bi], and Ai and Bi both depend on N(i-1). Without a
    // seen set on the scoped-reachability walk, each of a diamond's two
    // incoming edges re-explores everything below it, doubling the work
    // stacked diamond by stacked diamond: 40 layers is 2^40 node visits for
    // the unguarded walk, and a handful of milliseconds for the guarded one.
    const LAYERS = 40;
    let bottom: new (...args: any[]) => unknown = class Base {};
    const providers: any[] = [bottom];
    for (let i = 1; i <= LAYERS; i++) {
      class A {
        constructor(readonly n: unknown) {}
      }
      class B {
        constructor(readonly n: unknown) {}
      }
      class N {
        constructor(
          readonly a: unknown,
          readonly b: unknown,
        ) {}
      }
      Object.defineProperty(A, 'name', { value: `A${i}` });
      Object.defineProperty(B, 'name', { value: `B${i}` });
      Object.defineProperty(N, 'name', { value: `N${i}` });
      providers.push(
        provide(A, { deps: [bottom], lifetime: 'transient' }),
        provide(B, { deps: [bottom], lifetime: 'transient' }),
        provide(N, { deps: [A, B], lifetime: 'transient' }),
      );
      bottom = N;
    }
    // collectScoped seeds only from scoped factories (kind 'factory'); a
    // scoped class provider never seeds it, per the already-passing "levels
    // scoped factories" test above, so the diamond chain hangs off a factory.
    const MISSION = new Token<string>('Mission');
    providers.push(
      provide(MISSION, {
        useFactory: () => 'x',
        deps: [bottom],
        lifetime: 'scoped',
      }),
    );

    const bp = compile({
      root: defineModule({ name: 'Root', providers }),
    });
    expect(bp.scopedLevels).toEqual([[idOf(bp, MISSION)]]);
  });
});
