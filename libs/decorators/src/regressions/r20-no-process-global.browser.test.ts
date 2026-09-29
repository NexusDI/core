import { describe, expect, it } from 'vitest';

// Core loads here, with process present; core's own R20 loads it without.
// Nx forbids a dynamic import of a library that the package also imports
// statically, so only this package's entry loads after process is gone.
import * as core from '@nexusdi/core';

describe('R20', () => {
  it('evaluates every decorator with no process global', async () => {
    const saved = (globalThis as { process?: unknown }).process;
    delete (globalThis as { process?: unknown }).process;
    try {
      expect(typeof (globalThis as { process?: unknown }).process).toBe(
        'undefined',
      );
      const decorators = await import('../index.js');
      const NAME = new core.Token<string>('Name');

      @decorators.Injectable({ deps: [NAME] })
      class Greeter {
        constructor(readonly name: string) {}
      }
      class Panel {
        @decorators.Inject(Greeter) accessor greeter!: Greeter;
        @decorators.Inject(core.optional(new core.Token<number>('Missing')))
        accessor missing!: number | undefined;
      }
      @decorators.Module({
        providers: [
          core.provide(NAME, { useValue: 'Meridian' }),
          Greeter,
          Panel,
        ],
        exports: [Panel],
      })
      class Bridge {}

      await using ship = await core.Nexus.create(Bridge);
      expect(ship.get(Panel).greeter.name).toBe('Meridian');
      expect(ship.get(Panel).missing).toBeUndefined();
    } finally {
      if (saved !== undefined)
        (globalThis as { process?: unknown }).process = saved;
    }
  });
});
