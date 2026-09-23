import { describe, expect, it, vi } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
import { BlueprintError } from '../errors/index.js';
import { Nexus } from './nexus.js';

class ReactorCore {
  output = 1.21;
}
class SubspaceLink {}
class Drone {
  [Symbol.dispose]() {}
}
const MISSION = new Token<string>('Mission');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
const rawResolve = (target: { resolve(deps: never): unknown }, deps: unknown) =>
  target.resolve(deps as never);

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    ReactorCore,
    provide(Drone, { lifetime: 'transient' }),
    provide(MISSION, {
      useFactory: (request) => request.mission ?? 'none',
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(DIAGNOSTICS, { useValue: 'hull' }),
    provide(DIAGNOSTICS, { useValue: 'shields' }),
  ],
});

describe('Scope', () => {
  describe('resolve', () => {
    it('resolves every kind of entry in a deps map with the rules a factory deps tuple follows', async () => {
      const ship = await Nexus.create(Tactical);
      await using shuttle = await ship.createScope({
        request: { mission: 'survey-7' },
      });
      const deps = shuttle.resolve({
        reactor: ReactorCore,
        mission: MISSION,
        link: optional(SubspaceLink),
        present: optional(ReactorCore),
        later: lazy(ReactorCore),
        drone: lazy(Drone),
        checks: all(DIAGNOSTICS),
        request: REQUEST,
      });
      expect(deps.reactor).toBe(ship.get(ReactorCore));
      expect(deps.mission).toBe('survey-7');
      expect(deps.link).toBeUndefined();
      expect(deps.present).toBe(ship.get(ReactorCore));
      expect(deps.later()).toBe(ship.get(ReactorCore));
      expect(deps.drone()).not.toBe(deps.drone());
      expect(deps.checks).toEqual(['hull', 'shields']);
      expect(deps.request).toEqual({ mission: 'survey-7' });
      expect(shuttle.resolve({ mission: MISSION }).mission).toBe(
        shuttle.get(MISSION),
      );
    });

    it('resolves a deps tuple to a tuple', async () => {
      const ship = await Nexus.create(Tactical);
      await using shuttle = await ship.createScope({
        request: { mission: 'x' },
      });
      expect(shuttle.resolve([MISSION, optional(SubspaceLink)])).toEqual([
        'x',
        undefined,
      ]);
    });

    it('keeps a key named __proto__ as an own key of a plain result', async () => {
      const ship = await Nexus.create(Tactical);
      await using shuttle = await ship.createScope({
        request: { mission: 'x' },
      });
      const deps = Object.defineProperty({}, '__proto__', {
        value: ReactorCore,
        enumerable: true,
      });
      const resolved = rawResolve(shuttle, deps) as Record<string, unknown>;
      expect(
        Object.getOwnPropertyDescriptor(resolved, '__proto__')?.value,
      ).toBe(ship.get(ReactorCore));
      expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
    });

    it('throws NEXUS_LOADED_AFTER_SCOPE for an entry loaded after the scope was created', async () => {
      const ship = await Nexus.create(Tactical);
      await using shuttle = await ship.createScope({
        request: { mission: 'x' },
      });
      await ship.load(
        defineModule({
          name: 'Comms',
          providers: [SubspaceLink],
          exports: [SubspaceLink],
        }),
      );
      expect(
        thrown(() => shuttle.resolve({ link: SubspaceLink })),
      ).toMatchObject({
        code: 'NEXUS_LOADED_AFTER_SCOPE',
        token: 'SubspaceLink',
        entry: 'deps.link',
      });
    });
  });
});

describe('Nexus', () => {
  describe('resolve', () => {
    it('follows root get(): singletons resolve, a scoped entry throws NEXUS_SCOPE_REQUIRED', async () => {
      const ship = await Nexus.create(Tactical);
      expect(ship.resolve({ reactor: ReactorCore }).reactor).toBe(
        ship.get(ReactorCore),
      );
      expect(thrown(() => ship.resolve({ mission: MISSION }))).toMatchObject({
        code: 'NEXUS_SCOPE_REQUIRED',
        token: 'Mission',
        entry: 'deps.mission',
      });
      expect(thrown(() => ship.resolve([ReactorCore, REQUEST]))).toMatchObject({
        code: 'NEXUS_SCOPE_REQUIRED',
        token: 'REQUEST',
        entry: 'deps[1]',
      });
    });

    it('builds a transient from the root', async () => {
      const ship = await Nexus.create(Tactical);
      expect(ship.resolve({ drone: Drone }).drone).toBeInstanceOf(Drone);
    });

    it('resolves as if inside a module with the module option', async () => {
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [SubspaceLink],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Engineering] }),
      );
      expect(
        ship.resolve({ link: SubspaceLink }, { module: Engineering }).link,
      ).toBeInstanceOf(SubspaceLink);
    });

    it('throws the error root get() throws for an entry it cannot find', async () => {
      const Comms = defineModule({ name: 'Comms', providers: [SubspaceLink] });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Comms] }),
      );
      expect(thrown(() => ship.resolve({ link: SubspaceLink }))).toMatchObject({
        code: 'NEXUS_NOT_VISIBLE',
        owners: ['Comms'],
        entry: 'deps.link',
      });
      const missing = thrown(() =>
        ship.resolve([optional(SubspaceLink), ReactorCore]),
      ) as Error;
      expect(missing).toMatchObject({
        code: 'NEXUS_MISSING_PROVIDER',
        requester: null,
        entry: 'deps[1]',
        module: 'Meridian',
      });
      expect(
        missing.message.startsWith('[NEXUS_MISSING_PROVIDER] deps[1]'),
      ).toBe(true);
    });

    it('throws NEXUS_INVALID_TOKEN for an entry that is not a token, and for a bare MultiToken', async () => {
      const ship = await Nexus.create(Tactical);
      expect(thrown(() => rawResolve(ship, { name: 'nav' }))).toMatchObject({
        code: 'NEXUS_INVALID_TOKEN',
        received: 'the string "nav"',
        entry: 'deps.name',
      });
      const bare = thrown(() =>
        rawResolve(ship, { checks: DIAGNOSTICS }),
      ) as Error;
      expect(bare).toMatchObject({
        code: 'NEXUS_INVALID_TOKEN',
        received: 'an object',
        entry: 'deps.checks',
      });
      expect(bare.message).toBe(
        '[NEXUS_INVALID_TOKEN] deps.checks: an object is the MultiToken Diagnostics; wrap it in all().',
      );
    });
  });

  describe('validate', () => {
    it('returns nothing and builds nothing when every entry has a visible provider', async () => {
      const factory = vi.fn(() => new Drone());
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(Drone, {
              useFactory: factory,
              deps: [],
              lifetime: 'transient',
            }),
            ReactorCore,
          ],
        }),
      );
      expect(
        ship.validate({
          drone: Drone,
          reactor: lazy(ReactorCore),
          link: optional(SubspaceLink),
          none: all(DIAGNOSTICS),
        }),
      ).toBeUndefined();
      expect(factory).not.toHaveBeenCalled();
    });

    it('accepts a scoped entry, since every lifetime resolves from a scope', async () => {
      const ship = await Nexus.create(Tactical);
      expect(() =>
        ship.validate({ mission: MISSION, request: REQUEST }),
      ).not.toThrow();
    });

    it('reports every failing entry in one BlueprintError, with the near misses compilation reports', async () => {
      const NAV_CHARTS = new Token<string>('NavCharts');
      const Science = defineModule({
        name: 'Science',
        providers: [provide(NAV_CHARTS, { useValue: 'x' })],
      });
      const Comms = defineModule({ name: 'Comms', providers: [SubspaceLink] });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Science, Comms] }),
      );
      const error = thrown(() =>
        (ship.validate as (deps: unknown) => void)({
          charts: lazy(NAV_CHARTS),
          link: SubspaceLink,
          name: 'nav',
          maybe: optional(ReactorCore),
        }),
      );
      expect(error).toBeInstanceOf(BlueprintError);
      expect(error).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_NOT_VISIBLE',
            token: 'NavCharts',
            owners: ['Science'],
            entry: 'deps.charts',
          },
          {
            code: 'NEXUS_NOT_VISIBLE',
            token: 'SubspaceLink',
            owners: ['Comms'],
            entry: 'deps.link',
          },
          {
            code: 'NEXUS_INVALID_TOKEN',
            received: 'the string "nav"',
            entry: 'deps.name',
          },
        ],
      });
    });

    it('names the entry and the near misses in NEXUS_MISSING_PROVIDER', async () => {
      const OTHER = new Token<string>('NavCharts');
      const NAV_CHARTS = new Token<string>('NavCharts');
      const Science = defineModule({
        name: 'Science',
        providers: [provide(OTHER, { useValue: 'x' })],
        exports: [OTHER],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Science] }),
      );
      const error = thrown(() =>
        ship.validate({ charts: NAV_CHARTS }),
      ) as BlueprintError;
      expect(error.errors).toMatchObject([
        {
          code: 'NEXUS_MISSING_PROVIDER',
          token: 'NavCharts',
          requester: null,
          entry: 'deps.charts',
          module: 'Meridian',
          nearMisses: [{ kind: 'same-description', module: 'Science' }],
        },
      ]);
    });

    it('checks from inside a module with the module option', async () => {
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [SubspaceLink],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Engineering] }),
      );
      expect(() =>
        ship.validate({ link: SubspaceLink }, { module: Engineering }),
      ).not.toThrow();
      expect(() => ship.validate({ link: SubspaceLink })).toThrow(
        BlueprintError,
      );
    });
  });
});
