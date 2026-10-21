import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { Nexus } from '../runtime/nexus.js';
import { isForeign } from './brand.js';
import { declareModuleClass, defineModule } from './define-module.js';
import { all, optional } from './modifiers.js';
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

  it('raises NEXUS_CORE_NOT_SHARED for a module and a provider from another copy', async () => {
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
        {
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'a provider',
          where: 'Shell.providers[0]',
        },
        {
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'the module Remote',
          where: 'imported by Shell',
        },
      ],
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a token from another copy', async () => {
    const Remote = foreign({ description: 'meridian/NavCharts' });
    const error = await rejected(
      Nexus.create([provide(Remote as never, { useValue: 1 }) as never]),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'the Token meridian/NavCharts',
          where: 'root.providers[0]',
        },
      ],
    });
  });

  it('keeps NEXUS_INVALID_TOKEN for a token from another copy as a description', () => {
    const Remote = foreign({ description: 'meridian/NavCharts' });
    expect(thrown(() => new Token(Remote as never))).toMatchObject({
      code: 'NEXUS_INVALID_TOKEN',
      received: 'the Token meridian/NavCharts',
      reason: 'bad-description',
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a dep from another copy', async () => {
    const REMOTE = foreign({ description: 'meridian/Remote' });
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
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'the Token meridian/Remote',
          where: 'root.providers[0], deps[0]',
        },
      ],
    });
  });

  it('keeps the invalid codes for a value no copy of core made', async () => {
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
        { code: 'NEXUS_INVALID_PROVIDER' },
        { code: 'NEXUS_INVALID_MODULE' },
      ],
    });
  });

  it('keeps the invalid codes for a definition this copy made, in the wrong place', async () => {
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
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'not-a-provider' },
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'bad-dep' },
        { code: 'NEXUS_INVALID_PROVIDER', reason: 'bad-dep' },
        { code: 'NEXUS_INVALID_MODULE' },
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
      errors: [
        {
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'a provider',
          where: 'imported by Shell',
        },
      ],
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
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the module Remote',
      where: null,
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a value from another copy at load(), get() and has()', async () => {
    await using ship = await Nexus.create([]);
    const Remote = foreign({ name: 'Remote', providers: [] });
    expect(await rejected(ship.load(Remote as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the module Remote',
      where: 'load()',
    });
    const TOKEN = foreign({ description: 'meridian/NavCharts' });
    expect(thrown(() => ship.get(TOKEN as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the Token meridian/NavCharts',
      where: 'get()',
    });
    expect(thrown(() => ship.has(TOKEN as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the Token meridian/NavCharts',
      where: 'has()',
    });
    expect(ship.has({} as never)).toBe(false);
  });

  it('raises NEXUS_CORE_NOT_SHARED for a module from another copy as the root, a class included', async () => {
    const RemoteClass = foreign(class Remote {});
    expect(await rejected(Nexus.create(RemoteClass as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the module Remote',
      where: null,
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a module from another copy in the module option', async () => {
    const NAV = new Token<string>('Nav');
    await using ship = await Nexus.create([provide(NAV, { useValue: 'x' })]);
    const Remote = foreign({ name: 'Remote', providers: [] });
    const option = { module: Remote as never };
    expect(thrown(() => ship.get(NAV, option))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      where: 'get()',
    });
    expect(thrown(() => ship.has(NAV, option))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      where: 'has()',
    });
    expect(thrown(() => ship.resolve([NAV], option))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      where: 'resolve()',
    });
    expect(thrown(() => ship.validate([NAV], option))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      where: 'validate()',
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a deps entry and a deps value from another copy', async () => {
    await using ship = await Nexus.create([]);
    const REMOTE = foreign({ description: 'meridian/NavCharts' });
    expect(thrown(() => ship.resolve({ a: REMOTE } as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the Token meridian/NavCharts',
      where: 'resolve(), deps.a',
    });
    expect(
      thrown(() => ship.resolve([optional(REMOTE as never)] as never)),
    ).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the Token meridian/NavCharts',
      where: 'resolve(), deps[0]',
    });
    expect(thrown(() => ship.validate([REMOTE] as never))).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_CORE_NOT_SHARED', where: 'validate(), deps[0]' }],
    });
    expect(thrown(() => ship.resolve(REMOTE as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      where: 'resolve()',
    });
  });

  it('raises NEXUS_CORE_NOT_SHARED for a value from another copy passed to defineModule()', () => {
    const REMOTE = foreign({ description: 'meridian/NavCharts' });
    expect(thrown(() => defineModule(REMOTE as never))).toMatchObject({
      code: 'NEXUS_CORE_NOT_SHARED',
      received: 'the Token meridian/NavCharts',
      where: 'defineModule()',
    });
  });

  it('names the forRootAsync() factory in the place of a dep from another copy', async () => {
    const REMOTE = foreign({ description: 'meridian/NavCharts' });
    const Charts = defineModule({
      name: 'Charts',
      options: new Token<string>('ChartsOptions'),
    });
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          imports: [
            Charts.forRootAsync({
              useFactory: (n: unknown) => String(n),
              deps: [REMOTE as never],
            }),
          ],
        }),
      ),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_CORE_NOT_SHARED',
          received: 'the Token meridian/NavCharts',
          where: 'Charts.providers[0] (the forRootAsync() factory), deps[0]',
        },
      ],
    });
  });

  it('reads a Proxy around a token this copy made as its own, and resolves it', async () => {
    const NAV = new Token<string>('Nav');
    const proxied = new Proxy(NAV, {});
    expect(isForeign(proxied)).toBe(false);
    await using ship = await Nexus.create([
      provide(proxied, { useValue: 'charted' }),
    ]);
    expect(ship.get(proxied)).toBe('charted');
  });

  it('reads a value an rc.1 copy branded with true as foreign', () => {
    expect(isForeign(foreign({}))).toBe(true);
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

  it('counts a brand whatever value another copy wrote', () => {
    for (const value of ['0.5.0', false, 1, null]) {
      const remote = Object.defineProperty(
        {},
        Symbol.for('nexusdi.definition'),
        {
          value,
        },
      );
      expect(isForeign(remote)).toBe(true);
    }
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
