import { describe, expect, it } from 'vitest';

describe('R20', () => {
  it('evaluates every decorator with no process global', async () => {
    const saved = (globalThis as { process?: unknown }).process;
    delete (globalThis as { process?: unknown }).process;
    try {
      expect(typeof (globalThis as { process?: unknown }).process).toBe(
        'undefined',
      );
      const core = await import('../index.js');
      const NAME = new core.Token<string>('Name');

      @core.Injectable({ deps: [NAME] })
      class Greeter {
        constructor(readonly name: string) {}
      }
      class Panel {
        @core.Inject(Greeter) accessor greeter!: Greeter;
        @core.Inject(core.optional(new core.Token<number>('Missing')))
        accessor missing!: number | undefined;
      }
      @core.Module({
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
