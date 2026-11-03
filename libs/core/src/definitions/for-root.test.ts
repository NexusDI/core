import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { check } from '../runtime/check.js';
import { Nexus } from '../runtime/nexus.js';
import {
  declareModuleClass,
  defineModule,
  type ModuleRef,
} from './define-module.js';
import { provide } from './provide.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import { Token } from './token.js';

interface CommsOptions {
  frequency: number;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const VAULT = new Token<{ read(key: string): Promise<number> }>('Vault');
class SubspaceRelay {
  static deps = [COMMS_OPTIONS] as const;
  constructor(readonly options: CommsOptions) {}
}
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [SubspaceRelay],
  exports: [SubspaceRelay],
});

describe('forRoot', () => {
  it('provides the options value', async () => {
    const ship = await Nexus.create({
      imports: [Comms.forRoot({ frequency: 1420 })],
    });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 1420 });
  });

  it('stores a thenable value untouched', async () => {
    const lazyClient = { frequency: 1, then: () => 'never called' };
    const ship = await Nexus.create({ imports: [Comms.forRoot(lazyClient)] });
    expect(ship.get(SubspaceRelay).options).toBe(lazyClient);
  });

  it('reads a value that holds a useFactory function as a value', async () => {
    const odd = { frequency: 7, useFactory: () => 1, deps: [] };
    const ship = await Nexus.create({ imports: [Comms.forRoot(odd)] });
    expect(ship.get(SubspaceRelay).options).toBe(odd);
  });
});

describe('forRootAsync', () => {
  it('awaits the factory, with deps from the configured module', async () => {
    const Vault = defineModule({
      name: 'Vault',
      providers: [provide(VAULT, { useValue: { read: async () => 1420 } })],
      exports: [VAULT],
      global: true,
    });
    const ship = await Nexus.create({
      imports: [
        Vault,
        Comms.forRootAsync({
          useFactory: async (vault) => ({
            frequency: await vault.read('comms/frequency'),
          }),
          deps: [VAULT],
        }),
      ],
    });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 1420 });
  });

  it('defaults deps to none', async () => {
    const ship = await Nexus.create({
      imports: [Comms.forRootAsync({ useFactory: () => ({ frequency: 9 }) })],
    });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 9 });
  });

  it('reports a useFactory that is not a function', async () => {
    const error = await rejected(
      Nexus.create({
        imports: [Comms.forRootAsync({ useFactory: 4 } as never)],
      }),
    );
    expect(error).toMatchObject({
      errors: [
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'factory-not-a-function' },
      ],
    });
  });
});

describe('forRootAsync imports', () => {
  const SIGNAL = new Token<{ frequency(): number }>('Signal');
  const beacon = (name: string, frequency: number) =>
    defineModule({
      name,
      providers: [
        provide(SIGNAL, { useValue: { frequency: () => frequency } }),
      ],
      exports: [SIGNAL],
    });
  const tuned = (...imports: ModuleRef[]) =>
    Comms.forRootAsync({
      imports,
      useFactory: (signal) => ({ frequency: signal.frequency() }),
      deps: [SIGNAL],
    });

  it('appends the named modules to the instance and leaves the definition as it was', () => {
    const Beacon = beacon('Beacon', 1420);
    const Base = defineModule({
      name: 'Base',
      options: COMMS_OPTIONS,
      imports: [Comms.forRoot({ frequency: 1 })],
    });
    const instance = Base.forRootAsync({
      imports: [Beacon],
      useFactory: () => ({ frequency: 2 }),
    });
    expect(instance.imports).toEqual([Base.imports[0], Beacon]);
    expect(Base.imports).toHaveLength(1);
  });

  it('gives each call its own instance, which sees only its own imports', async () => {
    const Bridge = defineModule({
      name: 'Bridge',
      imports: [tuned(beacon('Near', 1420))],
      exports: [SubspaceRelay],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      imports: [tuned(beacon('Far', 1701))],
      exports: [SubspaceRelay],
    });
    const ship = await Nexus.create({ imports: [Bridge] });
    const other = await Nexus.create({ imports: [Tactical] });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 1420 });
    expect(other.get(SubspaceRelay).options).toEqual({ frequency: 1701 });
  });

  it('lets two instances in one graph each read their own source', async () => {
    const wing = (name: string, frequency: number) =>
      defineModule({
        name,
        imports: [tuned(beacon(`${name}Beacon`, frequency))],
      });
    const Port = wing('Port', 1420);
    const Starboard = wing('Starboard', 1701);
    const ship = await Nexus.create({ imports: [Port, Starboard] });
    expect(ship.get(SubspaceRelay, { module: Port }).options.frequency).toBe(
      1420,
    );
    expect(
      ship.get(SubspaceRelay, { module: Starboard }).options.frequency,
    ).toBe(1701);
  });

  it('reads imports: null as no imports', () => {
    const instance = Comms.forRootAsync({
      imports: null as never,
      useFactory: () => ({ frequency: 1 }),
    });
    expect(instance.imports).toEqual(Comms.imports);
  });

  it('walks a module that two instances name once', async () => {
    let built = 0;
    const Shared = defineModule({
      name: 'Shared',
      providers: [
        provide(SIGNAL, {
          useFactory: () => {
            built += 1;
            return { frequency: () => 1420 };
          },
        }),
      ],
      exports: [SIGNAL],
    });
    const wing = (name: string) =>
      defineModule({ name, imports: [tuned(Shared)] });
    await Nexus.create({ imports: [wing('Port'), wing('Starboard')] });
    expect(built).toBe(1);
  });

  it('reads a global module the caller names', async () => {
    const Global = defineModule({
      name: 'Global',
      global: true,
      providers: [provide(SIGNAL, { useValue: { frequency: () => 9 } })],
      exports: [SIGNAL],
    });
    const ship = await Nexus.create({ imports: [tuned(Global)] });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 9 });
  });

  it('reports a cycle that an import closes', async () => {
    class Hub {}
    declareModuleClass(Hub, { name: 'Hub', imports: [tuned(Hub)] });
    const error = (await rejected(Nexus.create(Hub))) as { errors: unknown[] };
    expect(error.errors[0]).toMatchObject({
      code: 'NEXUS_MODULE_IMPORT_CYCLE',
      path: ['Hub', 'Comms', 'Hub'],
    });
  });

  it('reports a module that is not a module, with its path', async () => {
    const error = (await rejected(
      Nexus.create(
        defineModule({ name: 'Root', imports: [tuned(7 as never)] }),
      ),
    )) as { errors: unknown[] };
    expect(error.errors[0]).toMatchObject({
      code: 'NEXUS_INVALID_MODULE',
      path: ['Root', 'Comms'],
    });
  });

  it('works through load() and a load import', async () => {
    const Host = beacon('Host', 1420);
    const ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Host] }),
    );
    await ship.load(
      defineModule({ name: 'Section', imports: [tuned(Host)], exports: [] }),
    );
    // A helper the instance names reads the host's export through the load import.
    const READING = new Token<number>('Reading');
    const Helper = defineModule({
      name: 'Helper',
      providers: [
        provide(READING, {
          useFactory: (signal: { frequency(): number }) => signal.frequency(),
          deps: [SIGNAL],
        }),
      ],
      exports: [READING],
    });
    const Late = defineModule({
      name: 'Late',
      imports: [
        Comms.forRootAsync({
          imports: [Helper],
          useFactory: (reading) => ({ frequency: reading }),
          deps: [READING],
        }),
      ],
      exports: [SubspaceRelay],
    });
    await ship.load(Late, { imports: [Host] });
    expect(ship.get(SubspaceRelay).options).toEqual({ frequency: 1420 });
  });

  it('makes check() report a missing provider in a named import as in a static one', () => {
    const MISSING = new Token<number>('Missing');
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(SIGNAL, { useFactory: () => null as never, deps: [MISSING] }),
      ],
      exports: [SIGNAL],
    });
    const named = thrown(() =>
      check(defineModule({ name: 'Root', imports: [tuned(Broken)] })),
    );
    // The same module, with Broken in the definition's own imports.
    const StaticComms = defineModule({
      name: 'Comms',
      options: COMMS_OPTIONS,
      imports: [Broken],
      providers: [SubspaceRelay],
      exports: [SubspaceRelay],
    });
    const plain = thrown(() =>
      check(
        defineModule({
          name: 'Root',
          imports: [
            StaticComms.forRootAsync({
              useFactory: (signal) => ({ frequency: signal.frequency() }),
              deps: [SIGNAL],
            }),
          ],
        }),
      ),
    );
    expect(named).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        { code: 'NEXUS_MISSING_PROVIDER', token: 'Missing', module: 'Broken' },
      ],
    });
    expect(named).toEqual(plain);
  });
});

describe('defineModule', () => {
  it('reports a configurable module imported without forRoot', async () => {
    const error = await rejected(Nexus.create({ imports: [Comms] }));
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_MODULE_OPTIONS_MISSING', module: 'Comms' }],
    });
  });
});

interface TunedInput {
  frequency: number;
  band?: string;
}
interface TunedOptions {
  frequency: number;
  band: string;
}
const TUNED = new Token<TunedOptions>('TunedOptions');
/** Reads `{ frequency, band? }` and defaults `band` to 'S'. */
const tunedSchema: StandardSchemaV1<TunedInput, TunedOptions> = {
  '~standard': {
    version: 1,
    vendor: 'nexusdi-test',
    validate: (value) => {
      const input = value as TunedInput;
      return { value: { frequency: input.frequency, band: input.band ?? 'S' } };
    },
  },
};
const Tuned = defineModule({
  name: 'Tuned',
  options: TUNED,
  schema: tunedSchema,
  exports: [TUNED],
});

describe('a schema with defaults', () => {
  it('fills a field forRoot() left out before the options token resolves', async () => {
    const ship = await Nexus.create({
      imports: [Tuned.forRoot({ frequency: 1420 })],
    });
    expect(ship.get(TUNED)).toEqual({ frequency: 1420, band: 'S' });
  });

  it('fills a field the forRootAsync() factory left out', async () => {
    const ship = await Nexus.create({
      imports: [
        Tuned.forRootAsync({ useFactory: async () => ({ frequency: 7 }) }),
      ],
    });
    expect(ship.get(TUNED)).toEqual({ frequency: 7, band: 'S' });
  });
});
