import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { Nexus } from '../runtime/nexus.js';
import { defineModule } from './define-module.js';
import { provide } from './provide.js';
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

describe('defineModule', () => {
  it('reports a configurable module imported without forRoot', async () => {
    const error = await rejected(Nexus.create({ imports: [Comms] }));
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_MODULE_OPTIONS_MISSING', module: 'Comms' }],
    });
  });
});
