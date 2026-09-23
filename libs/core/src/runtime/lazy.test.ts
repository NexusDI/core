import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { compile } from '../blueprint/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { makeThunk, type ResolveId } from './lazy.js';
import { Nexus } from './nexus.js';
import { createRootState } from './state.js';
import type { TransientOwner } from './state.js';
import { Tracer } from './trace.js';

class ShieldGrid {
  constructor(readonly router: PowerRouter) {}
  draw() {
    return 0.4;
  }
}
class PowerRouter {
  constructor(readonly shields: () => ShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}

describe('lazy', () => {
  it('resolves a lazy cycle once startup has finished', async () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
        provide(ShieldGrid, { deps: [PowerRouter] }),
      ],
    });
    const ship = await Nexus.create(Engineering);
    const router = ship.get(PowerRouter);
    expect(router.divert()).toBe(0.4);
    expect(router.shields()).toBe(ship.get(ShieldGrid));
    expect(ship.get(ShieldGrid).router).toBe(router);
  });

  it('throws NEXUS_NOT_READY when a constructor calls a thunk during startup', async () => {
    class EagerRouter {
      constructor(shields: () => ShieldGrid) {
        shields();
      }
    }
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(EagerRouter, { deps: [lazy(ShieldGrid)] }),
        provide(ShieldGrid, { deps: [EagerRouter as never] }),
      ],
    });
    const error = await rejected(Nexus.create(Engineering));
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'EagerRouter',
      cause: {
        code: 'NEXUS_NOT_READY',
        owner: 'EagerRouter',
        target: 'ShieldGrid',
        path: [],
      },
    });
  });

  it('throws NEXUS_NOT_READY for a target that is built and not yet ready', async () => {
    class Reactor {}
    class Monitor {
      constructor(reactor: Reactor, again: () => Reactor) {
        void reactor;
        again();
      }
    }
    const Root = defineModule({
      name: 'Root',
      providers: [
        Reactor,
        provide(Monitor, { deps: [Reactor, lazy(Reactor)] }),
      ],
    });
    expect(await rejected(Nexus.create(Root))).toMatchObject({
      cause: { code: 'NEXUS_NOT_READY', target: 'Reactor' },
    });
  });

  it('throws NEXUS_NOT_READY, never a cycle error, from an async continuation whose target is in flight', async () => {
    const A = new Token<string>('A');
    const B = new Token<string>('B');
    const gateA = deferred();
    const gateB = deferred<string>();
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(A, {
          useFactory: async (b) => {
            await gateA.promise;
            return b();
          },
          deps: [lazy(B)],
        }),
        provide(B, { useFactory: () => gateB.promise, deps: [] }),
      ],
    });
    const creating = Nexus.create(Root);
    gateA.resolve();
    await flush();
    gateB.resolve('b');
    expect(await rejected(creating)).toMatchObject({
      token: 'A',
      cause: { code: 'NEXUS_NOT_READY', owner: 'A', target: 'B', path: [] },
    });
  });

  it('returns a ready target to a thunk called in an async continuation', async () => {
    const CALLSIGN = new Token<string>('Callsign');
    const GREETING = new Token<string>('Greeting');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(CALLSIGN, { useValue: 'Meridian' }),
        provide(GREETING, {
          useFactory: async (callsign) => {
            await Promise.resolve();
            return `hail ${callsign()}`;
          },
          deps: [lazy(CALLSIGN)],
        }),
      ],
    });
    const ship = await Nexus.create(Root);
    expect(ship.get(GREETING)).toBe('hail Meridian');
  });

  it('builds a new transient on every thunk call', async () => {
    class Drone {}
    class Bay {
      constructor(readonly launch: () => Drone) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Drone, { lifetime: 'transient' }),
          provide(Bay, { deps: [lazy(Drone)] }),
        ],
      }),
    );
    const bay = ship.get(Bay);
    expect(bay.launch()).not.toBe(bay.launch());
  });

  it('reports the runtime cycle when a thunk reaches a target under construction', async () => {
    class Echo {
      constructor(self: () => Echo) {
        self();
      }
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(Echo, { deps: [lazy(Echo)], lifetime: 'transient' }),
        ],
      }),
    );
    expect(thrown(() => ship.get(Echo))).toMatchObject({
      code: 'NEXUS_NOT_READY',
      owner: 'Echo',
      target: 'Echo',
      path: ['Echo', 'Echo'],
    });
  });

  it('follows a long alias chain to its target without overflowing the call stack', async () => {
    const CHAIN_LENGTH = 20000;
    const chain = Array.from(
      { length: CHAIN_LENGTH + 1 },
      (_, i) => new Token<string>(`Link${i}`),
    );
    const providers = chain
      .slice(0, CHAIN_LENGTH)
      .map((token, i) => provide(token, { useExisting: chain[i + 1] }));
    const end = provide(chain[CHAIN_LENGTH], { useValue: 'end' });
    class Reader {
      constructor(readonly link: () => string) {}
    }
    const Root = defineModule({
      name: 'Root',
      providers: [
        ...providers,
        end,
        provide(Reader, { deps: [lazy(chain[0])] }),
      ],
    });
    const ship = await Nexus.create(Root);
    expect(ship.get(Reader).link()).toBe('end');
  });

  it('resolves a singleton thunk building a transient with a singleton-thunk owner, never the container', () => {
    class Drone {}
    class Bay {}
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(Drone, { lifetime: 'transient' }),
          provide(Bay, { deps: [] }),
        ],
      }),
    });
    const root = createRootState({
      blueprint: bp,
      rootRef: {},
      tracer: new Tracer(),
      initEnabled: true,
      scopeContext: undefined,
    });
    const droneRecord = [...bp.providers.values()].find(
      (record) => record.name === 'Drone',
    )!;
    const bayRecord = [...bp.providers.values()].find(
      (record) => record.name === 'Bay',
    )!;
    const owners: TransientOwner[] = [];
    const resolve: ResolveId = (id, ctx) => {
      owners.push(ctx.owner);
      return {};
    };
    const thunk = makeThunk(
      droneRecord.id,
      bayRecord,
      { bp, container: root, owner: root },
      resolve,
    );
    thunk();
    // adopt() in build.ts tracks a built transient for disposal only when
    // ctx.owner is a container object (spec section 6.5); a singleton's
    // thunk passes the string 'singleton-thunk' instead, so each transient
    // it builds stays untracked rather than joining root.owned.
    expect(owners).toEqual(['singleton-thunk']);
  });
});
