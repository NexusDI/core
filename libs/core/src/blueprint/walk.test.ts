import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { compileErrors } from '../../test-support/compile.js';
import { LoadGrantError } from '../errors/index.js';
import type { Blueprint } from './blueprint.js';
import {
  declareModuleClass,
  defineModule,
} from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { compile } from './compile.js';

class ReactorCore {}
class ShieldGrid {}
class SubspaceLink {}
class Sensors {}
const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');

describe('compile', () => {
  it('assigns module and provider ids in depth-first walk order', () => {
    const Deep = defineModule({ name: 'Deep', providers: [Sensors] });
    const Engineering = defineModule({
      name: 'Engineering',
      imports: [Deep],
      providers: [ShieldGrid],
    });
    const Comms = defineModule({ name: 'Comms', providers: [SubspaceLink] });
    const Meridian = defineModule({
      name: 'Meridian',
      imports: [Engineering, Comms],
      providers: [ReactorCore],
    });

    const bp = compile({ root: Meridian });

    expect([...bp.modules.values()].map((m) => [m.id, m.name])).toEqual([
      ['m0', 'Meridian'],
      ['m1', 'Engineering'],
      ['m2', 'Deep'],
      ['m3', 'Comms'],
    ]);
    expect(
      [...bp.providers.values()]
        .filter((p) => p.id !== 'request')
        .map((p) => [p.id, p.name, p.module]),
    ).toEqual([
      ['p0', 'ReactorCore', 'm0'],
      ['p1', 'ShieldGrid', 'm1'],
      ['p2', 'Sensors', 'm2'],
      ['p3', 'SubspaceLink', 'm3'],
    ]);
    expect(bp.root).toBe('m0');
    expect(bp.modules.get('m0')?.imports).toEqual(['m1', 'm3']);
  });

  it('walks a module imported twice once, by identity', () => {
    const Shared = defineModule({ name: 'Shared', providers: [ReactorCore] });
    const A = defineModule({ name: 'A', imports: [Shared] });
    const B = defineModule({ name: 'B', imports: [Shared] });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [A, B] }),
    });
    expect([...bp.modules.values()].map((m) => m.name)).toEqual([
      'Root',
      'A',
      'Shared',
      'B',
    ]);
    expect(bp.providers.size - 1).toBe(1);
  });

  it('walks two forRoot() instances as two modules', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [
          Comms.forRoot({ frequency: 1 }),
          Comms.forRoot({ frequency: 1 }),
        ],
      }),
    });
    expect([...bp.modules.values()].map((m) => m.name)).toEqual([
      'Root',
      'Comms',
      'Comms',
    ]);
  });

  it('provides the options token inside a forRoot() instance', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [Comms.forRoot({ frequency: 1420 })],
      }),
    });
    expect(
      [...bp.providers.values()].filter((p) => p.id !== 'request'),
    ).toMatchObject([
      {
        token: COMMS_OPTIONS,
        kind: 'value',
        module: 'm1',
        value: { frequency: 1420 },
      },
    ]);
  });

  it('adds extra imports to the root module after its own', () => {
    const Science = defineModule({ name: 'Science', providers: [Sensors] });
    const bp = compile({
      root: defineModule({ name: 'Root' }),
      extraImports: [Science],
    });
    expect(bp.modules.get('m0')?.imports).toEqual(['m1']);
    expect(bp.extraImports).toEqual([Science]);
  });

  it('reports NEXUS_MODULE_IMPORT_CYCLE with the full path', () => {
    class A {}
    class B {}
    declareModuleClass(A, { name: 'A', imports: [B] });
    declareModuleClass(B, { name: 'B', imports: [A] });
    expect(
      compileErrors(defineModule({ name: 'Root', imports: [A] })),
    ).toMatchObject([
      { code: 'NEXUS_MODULE_IMPORT_CYCLE', path: ['A', 'B', 'A'] },
    ]);
  });

  it('reports NEXUS_INVALID_MODULE with the import path that reached it', () => {
    const Tactical = defineModule({
      name: 'Tactical',
      imports: [undefined as never],
    });
    expect(
      compileErrors(defineModule({ name: 'Meridian', imports: [Tactical] })),
    ).toMatchObject([
      {
        code: 'NEXUS_INVALID_MODULE',
        received: 'undefined',
        path: ['Meridian', 'Tactical'],
      },
    ]);
  });

  it('reports NEXUS_INVALID_MODULE for a root that is not a module', () => {
    expect(compileErrors({ name: 'Fake' })).toMatchObject([
      { code: 'NEXUS_INVALID_MODULE', received: 'an object', path: [] },
    ]);
  });

  it('reports NEXUS_MODULE_OPTIONS_MISSING for a configurable module imported without forRoot()', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    expect(
      compileErrors(defineModule({ name: 'Root', imports: [Comms] })),
    ).toMatchObject([
      { code: 'NEXUS_MODULE_OPTIONS_MISSING', module: 'Comms' },
    ]);
  });

  it('reports NEXUS_DUPLICATE_PROVIDER for a plain token provided twice in one module', () => {
    const NAME = new Token<string>('Name');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(NAME, { useValue: 'a' }),
        provide(NAME, { useValue: 'b' }),
      ],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_DUPLICATE_PROVIDER', token: 'Name', module: 'Root' },
    ]);
  });

  it('holds one provide() entry for a plain token listed twice as one provider, not a duplicate', () => {
    const NAME = new Token<string>('Name');
    const entry = provide(NAME, { useValue: 'a' });
    const bp = compile({
      root: defineModule({ name: 'Root', providers: [entry, entry] }),
    });
    expect(
      [...bp.providers.values()].filter((p) => p.id !== 'request'),
    ).toHaveLength(1);
  });

  it('accepts many contributions to a MultiToken in one module', () => {
    const NAMES = new MultiToken<string>('Names');
    const bp = compile({
      root: defineModule({
        name: 'Root',
        providers: [
          provide(NAMES, { useValue: 'a' }),
          provide(NAMES, { useValue: 'b' }),
        ],
      }),
    });
    expect(bp.providers.size - 1).toBe(2);
  });

  it('keeps the same token provided in two modules as two providers', () => {
    const A = defineModule({ name: 'A', providers: [ReactorCore] });
    const B = defineModule({ name: 'B', providers: [ReactorCore] });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [A, B] }),
    });
    expect(
      [...bp.providers.values()]
        .filter((p) => p.id !== 'request')
        .map((p) => p.module),
    ).toEqual(['m1', 'm2']);
  });

  it('keeps two distinct classes that share a name as two providers', () => {
    const first = (() => class Probe {})();
    const second = (() => class Probe {})();
    const bp = compile({
      root: defineModule({ name: 'Root', providers: [first, second] }),
    });
    expect(
      [...bp.providers.values()]
        .filter((p) => p.id !== 'request')
        .map((p) => p.name),
    ).toEqual(['Probe', 'Probe']);
  });
});

describe('compile with a grant', () => {
  const Engineering = defineModule({
    name: 'Engineering',
    providers: [ReactorCore],
    exports: [ReactorCore],
  });
  const Navigation = defineModule({ name: 'Navigation' });
  const Hold = defineModule({ name: 'Hold' });
  const Host = defineModule({
    name: 'Host',
    imports: [
      defineModule({
        name: 'Wrapper',
        imports: [Engineering, Navigation, Hold],
      }),
    ],
  });
  const first = compile({ root: Host });
  const idOf = (bp: Blueprint, name: string): string => {
    const node = [...bp.modules.values()].find((m) => m.name === name);
    if (node === undefined) throw new Error(`no module ${name}`);
    return node.id;
  };

  it('records the grant on each new module of the entry and adds it to the imports', () => {
    const Deep = defineModule({ name: 'Deep', providers: [Sensors] });
    const Science = defineModule({
      name: 'Science',
      imports: [Deep],
      providers: [ShieldGrid],
    });
    const bp = compile({
      root: Host,
      extraImports: [{ module: Science, imports: [Engineering] }],
      previous: first,
    });
    const engineering = idOf(bp, 'Engineering');
    for (const name of ['Science', 'Deep']) {
      const node = bp.modules.get(idOf(bp, name));
      expect(node?.grants).toEqual([engineering]);
      expect(node?.imports).toContain(engineering);
    }
    expect(bp.modules.get(idOf(bp, 'Host'))?.grants).toEqual([]);
    expect(bp.modules.get(idOf(bp, 'Host'))?.imports).not.toContain(
      engineering,
    );
    expect(idOf(bp, 'Engineering')).toBe(idOf(first, 'Engineering'));
  });

  it('gives a module the graph held no grant, and keeps an earlier grant as it is', () => {
    const Science = defineModule({ name: 'Science' });
    const second = compile({
      root: Host,
      extraImports: [{ module: Science, imports: [Engineering] }],
      previous: first,
    });
    const Lab = defineModule({ name: 'Lab', imports: [Science, Hold] });
    const third = compile({
      root: Host,
      extraImports: [
        { module: Science, imports: [Engineering] },
        { module: Lab, imports: [Navigation] },
      ],
      previous: second,
    });
    expect(third.modules.get(idOf(third, 'Science'))?.grants).toEqual([
      idOf(third, 'Engineering'),
    ]);
    expect(third.modules.get(idOf(third, 'Hold'))?.grants).toEqual([]);
    expect(third.modules.get(idOf(third, 'Lab'))?.grants).toEqual([
      idOf(third, 'Navigation'),
    ]);
  });

  describe('a module that already imports a granted module', () => {
    const Deep = defineModule({ name: 'Deep' });
    const Science = defineModule({
      name: 'Science',
      imports: [Engineering, Deep],
    });
    const granted = compile({
      root: Host,
      extraImports: [{ module: Science, imports: [Engineering, Navigation] }],
      previous: first,
    });

    it('lists in grants only the ids the grant added, and keeps the declared import in imports', () => {
      const engineering = idOf(granted, 'Engineering');
      const navigation = idOf(granted, 'Navigation');
      const science = granted.modules.get(idOf(granted, 'Science'));
      expect(science?.imports.filter((id) => id === engineering)).toHaveLength(
        1,
      );
      expect(science?.grants).toEqual([navigation]);
      expect(granted.modules.get(idOf(granted, 'Deep'))?.grants).toEqual([
        engineering,
        navigation,
      ]);
    });

    it('still reads the whole granted set as the recorded one', () => {
      const repeat = (imports: unknown[]) =>
        compile({
          root: Host,
          extraImports: [
            { module: Science, imports: [Engineering, Navigation] },
            { module: Science, imports: imports as never },
          ],
          previous: granted,
        });
      expect(() => repeat([Navigation, Engineering])).not.toThrow();
      expect(thrown(() => repeat([Engineering]))).toMatchObject({
        code: 'NEXUS_LOAD_GRANT',
        reason: 'already-loaded',
      });
    });

    it('names the first requested module the record lacks, or the first requested one for a subset', () => {
      const repeat = (module: typeof Science, imports: unknown[]) =>
        thrown(() =>
          compile({
            root: Host,
            extraImports: [
              { module: Science, imports: [Engineering, Navigation] },
              { module, imports: imports as never },
            ],
            previous: granted,
          }),
        );
      expect(repeat(Science, [Engineering, Hold])).toMatchObject({
        reason: 'already-loaded',
        grant: 'Hold',
      });
      expect(repeat(Science, [Navigation])).toMatchObject({
        reason: 'already-loaded',
        grant: 'Navigation',
      });
    });
  });

  it('throws LoadGrantError alone, ahead of the walk, for each reason', () => {
    const Science = defineModule({ name: 'Science' });
    const grantTo = (imports: unknown[], module = Science): unknown =>
      thrown(() =>
        compile({
          root: Host,
          extraImports: [{ module, imports: imports as never }],
          previous: first,
        }),
      );
    expect(grantTo([defineModule({ name: 'Hangar' })])).toMatchObject({
      code: 'NEXUS_LOAD_GRANT',
      module: 'Science',
      grant: 'Hangar',
      reason: 'not-in-graph',
    });
    expect(grantTo([Host])).toBeInstanceOf(LoadGrantError);
    expect(grantTo([Host])).toMatchObject({ reason: 'root', grant: 'Host' });
  });
});
