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
});
