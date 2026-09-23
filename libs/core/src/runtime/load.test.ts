import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

class ReactorCore {}
class Probe {
  constructor(readonly reactor: ReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [ReactorCore],
  exports: [ReactorCore],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

describe('Nexus', () => {
  describe('load', () => {
    it('adds a module after startup, builds its singletons and shows its exports at the root', async () => {
      const Science = defineModule({
        name: 'Science',
        imports: [Engineering],
        providers: [provide(Probe, { deps: [ReactorCore] })],
        exports: [Probe],
      });
      const ship = await Nexus.create(Meridian);
      expect(ship.has(Probe)).toBe(false);
      await ship.load(Science);
      expect(ship.get(Probe).reactor).toBe(ship.get(ReactorCore));
    });

    it('does nothing for a module the root already imports', async () => {
      const factory = vi.fn(() => 'x');
      const NAME = new Token<string>('Name');
      const Named = defineModule({
        name: 'Named',
        providers: [provide(NAME, { useFactory: factory, deps: [] })],
        exports: [NAME],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Named] }),
      );
      await ship.load(Named);
      expect(factory).toHaveBeenCalledOnce();
    });

    it('adds the root import and builds nothing for a module in the graph the root cannot see', async () => {
      const factory = vi.fn(() => 'x');
      const NAME = new Token<string>('Name');
      const Hidden = defineModule({
        name: 'Hidden',
        providers: [provide(NAME, { useFactory: factory, deps: [] })],
        exports: [NAME],
      });
      const Wrapper = defineModule({ name: 'Wrapper', imports: [Hidden] });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Wrapper] }),
      );
      expect(ship.has(NAME)).toBe(false);
      await ship.load(Hidden);
      expect(ship.get(NAME)).toBe('x');
      expect(factory).toHaveBeenCalledOnce();
    });

    it('rejects NEXUS_LOAD_GLOBAL_MODULE for a global module', async () => {
      const Telemetry = defineModule({ name: 'Telemetry', global: true });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Telemetry))).toMatchObject({
        code: 'NEXUS_LOAD_GLOBAL_MODULE',
        module: 'Telemetry',
      });
    });

    it('rejects NEXUS_INVALID_MODULE for a value that is not a module', async () => {
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load({} as never))).toMatchObject({
        code: 'NEXUS_INVALID_MODULE',
        received: 'an object',
      });
    });

    it('rejects a BlueprintError and leaves the container unchanged when the root would see an ambiguous export', async () => {
      class OtherReactor {}
      const Rival = defineModule({
        name: 'Rival',
        providers: [
          provide(ReactorCore, { useClass: OtherReactor }),
          provide(Probe, { deps: [ReactorCore] }),
        ],
        exports: [ReactorCore, Probe],
      });
      const ship = await Nexus.create(Meridian);
      const before = ship.get(ReactorCore);
      expect(await rejected(ship.load(Rival))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_AMBIGUOUS_PROVIDER',
            token: 'ReactorCore',
            module: 'Meridian',
          },
        ],
      });
      expect(ship.get(ReactorCore)).toBe(before);
      expect(ship.has(Probe)).toBe(false);
    });

    it('disposes what a failed load built and rethrows', async () => {
      const log: string[] = [];
      class Sensor {
        [Symbol.dispose]() {
          log.push('sensor disposed');
        }
      }
      class SensorArray {
        constructor(readonly sensor: Sensor) {
          throw new Error('array misaligned');
        }
      }
      const Science = defineModule({
        name: 'Science',
        providers: [Sensor, provide(SensorArray, { deps: [Sensor] })],
        exports: [Sensor],
      });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Science))).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'SensorArray',
      });
      expect(log).toEqual(['sensor disposed']);
      expect(ship.has(Sensor)).toBe(false);
    });

    it('runs concurrent loads one at a time, in call order', async () => {
      const order: string[] = [];
      const gate = deferred<string>();
      const A = new Token<string>('A');
      const B = new Token<string>('B');
      const First = defineModule({
        name: 'First',
        providers: [
          provide(A, {
            useFactory: () => (order.push('first starts'), gate.promise),
            deps: [],
          }),
        ],
      });
      const Second = defineModule({
        name: 'Second',
        providers: [
          provide(B, {
            useFactory: () => (order.push('second starts'), 'b'),
            deps: [],
          }),
        ],
      });
      const ship = await Nexus.create(Meridian);
      const first = ship.load(First);
      const second = ship.load(Second);
      await flush();
      expect(order).toEqual(['first starts']);
      gate.resolve('a');
      await Promise.all([first, second]);
      expect(order).toEqual(['first starts', 'second starts']);
    });

    it('rebuilds no existing singleton across sequential loads that recompile the whole graph (S6)', async () => {
      let reactorBuilds = 0;
      class CountedReactor {
        constructor() {
          reactorBuilds++;
        }
      }
      const Engineering2 = defineModule({
        name: 'Engineering2',
        providers: [CountedReactor],
        exports: [CountedReactor],
      });
      const Meridian2 = defineModule({
        name: 'Meridian2',
        imports: [Engineering2],
      });
      const ship = await Nexus.create(Meridian2);
      expect(reactorBuilds).toBe(1);
      const first = ship.get(CountedReactor);

      const Science = defineModule({
        name: 'Science',
        imports: [Engineering2],
      });
      await ship.load(Science);
      expect(reactorBuilds).toBe(1);
      expect(ship.get(CountedReactor)).toBe(first);

      const Lab = defineModule({ name: 'Lab', imports: [Engineering2] });
      await ship.load(Lab);
      expect(reactorBuilds).toBe(1);
      expect(ship.get(CountedReactor)).toBe(first);
    });
  });
});
