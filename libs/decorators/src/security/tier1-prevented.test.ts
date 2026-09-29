/**
 * Tier 1: hostile inputs the decorators are held against. One describe per
 * entry of libs/decorators/SECURITY.md, titled with its identifier.
 */
import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

import { extraKeys, snapshotBuiltins } from '../../test-support/security.js';
import { Inject, Injectable, Module } from '../index.js';

describe('SEC-003 a polluted Object.prototype (CWE-1321)', () => {
  it('keeps an @Injectable class a singleton when Object.prototype carries lifetime at decoration time', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['lifetime'] = 'transient';
    try {
      @Injectable({ deps: [] })
      class Reactor {}
      await using ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      expect(ship.get(Reactor)).toBe(ship.get(Reactor));
    } finally {
      delete proto['lifetime'];
    }
  });

  it('builds an @Injectable class by its own arity when Object.prototype carries deps at decoration time', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    const HIJACKED = new Token<string>('Hijacked');
    proto['deps'] = [HIJACKED];
    try {
      @Injectable({ lifetime: 'singleton' })
      class Reactor {}
      await using ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Reactor] }),
      );
      expect(ship.get(Reactor)).toBeInstanceOf(Reactor);
    } finally {
      delete proto['deps'];
    }
  });

  const SIGNAL = new Token<string>('Signal');
  const hiddenAndFeature = () => ({
    hidden: {
      providers: [provide(SIGNAL, { useValue: 'on' })],
      exports: [SIGNAL],
    },
    feature: {
      providers: [provide(new Token<string>('Relay'), { useValue: 'r' })],
    },
  });

  it('keeps an @Module class local when Object.prototype carries global at decoration time', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['global'] = true;
    try {
      const { hidden, feature } = hiddenAndFeature();
      @Module(hidden)
      class Hidden {}
      @Module(feature)
      class Feature {}
      await using ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Hidden, Feature] }),
      );
      expect(ship.has(SIGNAL, { module: Feature })).toBe(false);
    } finally {
      delete proto['global'];
    }
  });
});

describe('SEC-004 decorator metadata and Object.prototype (CWE-1321)', () => {
  it('keeps decorator metadata off Object and the built-ins for a class that extends Object', async () => {
    const before = snapshotBuiltins();
    @Injectable({ deps: [] })
    class Direct extends Object {}
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Direct] }),
    );
    expect(ship.get(Direct)).toBeInstanceOf(Direct);
    expect(extraKeys('Object')).toEqual([]);
    expect(snapshotBuiltins()).toEqual(before);
  });
});

describe('SEC-005 frozen instances with decorators (CWE-471)', () => {
  it('injects a property into an instance frozen in its constructor, through the accessor storage', async () => {
    const CALLSIGN = new Token<string>('Callsign');
    class Bridge {
      @Inject(CALLSIGN) accessor callsign!: string;
      constructor() {
        Object.freeze(this);
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [provide(CALLSIGN, { useValue: 'Meridian' }), Bridge],
      }),
    );
    expect(ship.get(Bridge).callsign).toBe('Meridian');
    expect(Object.isFrozen(ship.get(Bridge))).toBe(true);
  });
});

describe('SEC-011 no global writes with the decorators loaded (CWE-471)', () => {
  it('leaves the built-ins unchanged across a decorated create and dispose', async () => {
    const before = snapshotBuiltins();
    @Injectable({ deps: [] })
    class Reactor {}
    class Console {
      @Inject(Reactor) accessor reactor!: Reactor;
    }
    const ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Reactor, Console] }),
    );
    expect(ship.get(Console).reactor).toBe(ship.get(Reactor));
    await ship[Symbol.asyncDispose]();
    expect(snapshotBuiltins()).toEqual(before);
    for (const key of extraKeys('Symbol'))
      expect(['metadata', 'dispose', 'asyncDispose']).toContain(key);
  });
});
