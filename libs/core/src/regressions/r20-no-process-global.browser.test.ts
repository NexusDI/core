import { describe, expect, it } from 'vitest';

import '../../test-support/symbol-metadata.js';

describe('R20', () => {
  it('evaluates every class metadata function with no process global', async () => {
    const saved = (globalThis as { process?: unknown }).process;
    delete (globalThis as { process?: unknown }).process;
    try {
      expect(typeof (globalThis as { process?: unknown }).process).toBe(
        'undefined',
      );
      const core = await import('../index.js');
      const NAME = new core.Token<string>('Name');

      class Greeter {
        constructor(readonly name: string) {}
      }
      const greeter = Object.create(null) as DecoratorMetadataObject;
      core.declareClass(greeter, { deps: [NAME] });
      Object.defineProperty(Greeter, Symbol.metadata, { value: greeter });
      class Panel {
        greeter!: Greeter;
        missing!: number | undefined;
      }
      const panel = Object.create(null) as DecoratorMetadataObject;
      core.declareProperty(panel, 'greeter', Greeter);
      core.declareProperty(
        panel,
        'missing',
        core.optional(new core.Token<number>('Missing')),
      );
      Object.defineProperty(Panel, Symbol.metadata, { value: panel });
      const Bridge = core.declareModuleClass(class Bridge {}, {
        name: 'Bridge',
        providers: [
          core.provide(NAME, { useValue: 'Meridian' }),
          Greeter,
          Panel,
        ],
        exports: [Panel],
      });

      await using ship = await core.Nexus.create(Bridge);
      expect(ship.get(Panel).greeter.name).toBe('Meridian');
      expect(ship.get(Panel).missing).toBeUndefined();
    } finally {
      if (saved !== undefined)
        (globalThis as { process?: unknown }).process = saved;
    }
  });
});
