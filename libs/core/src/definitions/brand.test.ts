import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { Nexus } from '../runtime/nexus.js';
import { isForeign } from './brand.js';
import { declareModuleClass, defineModule } from './define-module.js';
import { all } from './modifiers.js';
import { provide } from './provide.js';
import { MultiToken, Token } from './token.js';

/** What another copy of core makes: an object with the brand and nothing this copy knows. */
const foreign = <T extends object>(value: T): T =>
  Object.defineProperty(value, Symbol.for('nexusdi.definition'), {
    value: true,
  });

describe('brand', () => {
  it('marks every definition core makes, non-enumerably, and knows its own', () => {
    const Configured = defineModule({
      name: 'Configured',
      options: new Token<string>('Options'),
    });
    for (const value of [
      new Token<string>('A'),
      new MultiToken<string>('M'),
      provide(new Token<string>('B'), { useValue: 'b' }),
      defineModule({ name: 'C' }),
      Configured,
      Configured.forRoot('x'),
      Configured.forRootAsync({ useFactory: () => 'x' }),
    ]) {
      expect(isForeign(value)).toBe(false);
      expect(Reflect.ownKeys(value)).toContain(
        Symbol.for('nexusdi.definition'),
      );
      expect(
        Object.getOwnPropertyDescriptor(value, Symbol.for('nexusdi.definition'))
          ?.enumerable,
      ).toBe(false);
    }
  });

  it('keeps provide() results and module definitions frozen', () => {
    expect(
      Object.isFrozen(provide(new Token<string>('B'), { useValue: 'b' })),
    ).toBe(true);
    expect(Object.isFrozen(defineModule({ name: 'C' }))).toBe(true);
  });

  it('sets otherCopy for a module and a provider from another copy', async () => {
    const Remote = foreign({
      name: 'Remote',
      imports: [],
      providers: [],
      exports: [],
    });
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          imports: [Remote as never],
          providers: [foreign({}) as never],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        { code: 'NEXUS_INVALID_PROVIDER', otherCopy: true },
        { code: 'NEXUS_INVALID_MODULE', otherCopy: true },
      ],
    });
  });

  it('sets otherCopy for a token from another copy', async () => {
    const Remote = foreign(Object.create(null) as object);
    const error = await rejected(
      Nexus.create([provide(Remote as never, { useValue: 1 }) as never]),
    );
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_INVALID_TOKEN', otherCopy: true }],
    });
  });

  it('sets otherCopy for a dep from another copy', async () => {
    const REMOTE = foreign(Object.create(null) as object);
    const LOCAL = new Token<number>('Local');
    const error = await rejected(
      Nexus.create([
        provide(LOCAL, {
          useFactory: (n: number) => n,
          deps: [REMOTE as never],
        }),
      ]),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_INVALID_PROVIDER',
          reason: 'bad-dep',
          otherCopy: true,
        },
      ],
    });
  });

  it('leaves otherCopy false for a value no copy of core made', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          imports: [{} as never],
          providers: [{} as never],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        { code: 'NEXUS_INVALID_PROVIDER', otherCopy: false },
        { code: 'NEXUS_INVALID_MODULE', otherCopy: false },
      ],
    });
  });

  it('leaves otherCopy false for a definition this copy made, in the wrong place', async () => {
    const NAV = new Token<string>('Nav');
    const CHECKS = new MultiToken<string>('Checks');
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          imports: [NAV as never],
          providers: [
            NAV as never,
            provide(new Token<string>('Plot'), {
              useFactory: (checks: unknown[]) => String(checks),
              deps: [all(NAV as never)],
            }),
            provide(new Token<string>('Chart'), {
              useFactory: (n: string) => n,
              deps: [CHECKS as never],
            }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_INVALID_PROVIDER',
          reason: 'not-a-provider',
          otherCopy: false,
        },
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'bad-dep', otherCopy: false },
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'bad-dep', otherCopy: false },
        { code: 'NEXUS_INVALID_MODULE', otherCopy: false },
      ],
    });
  });

  it('never accepts a value for its brand alone, in imports', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({ name: 'Shell', imports: [foreign({}) as never] }),
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_INVALID_MODULE', otherCopy: true }],
    });
  });

  it('never accepts a value for its brand alone, as the root', async () => {
    const error = await rejected(
      Nexus.create(
        foreign({
          name: 'Remote',
          imports: [],
          providers: [],
          exports: [],
          global: false,
        }) as never,
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_INVALID_MODULE',
      received: 'an object with the keys "name", "global"',
      otherCopy: true,
    });
  });

  it('declares a frozen or proxied module class, which stays unbranded', async () => {
    class Frozen {}
    const Hostile = new Proxy(class Hostile {}, {
      defineProperty: () => {
        throw new Error('trap');
      },
    });
    for (const cls of [Object.freeze(Frozen), Hostile]) {
      declareModuleClass(cls, { name: 'Bay' });
      expect(isForeign(cls)).toBe(false);
      await using ship = await Nexus.create(cls);
      expect(ship).toBeDefined();
    }
  });

  it('reads the brand as an own property only', () => {
    const Branded = foreign(class {});
    class Child extends Branded {}
    const Mine = new Token<string>('Mine');
    expect(isForeign(Branded)).toBe(true);
    expect(isForeign(Object.create(Mine) as object)).toBe(false);
    expect(isForeign(Child)).toBe(false);
    expect(isForeign(Object.create(foreign({})) as object)).toBe(false);
  });

  it('reads false from a Proxy whose traps throw', () => {
    const trap = (): never => {
      throw new Error('trap');
    };
    const hostile = new Proxy(
      {},
      { get: trap, getOwnPropertyDescriptor: trap, has: trap, ownKeys: trap },
    );
    expect(isForeign(hostile)).toBe(false);
  });

  it('reads false for primitives', () => {
    for (const value of [null, undefined, 1, 'a', Symbol('s')])
      expect(isForeign(value)).toBe(false);
  });
});
