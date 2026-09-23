import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import {
  defineModule,
  registerModuleClass,
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
      [...bp.providers.values()].map((p) => [p.id, p.name, p.module]),
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
    expect(bp.providers.size).toBe(1);
  });

  it('walks two with() instances as two modules', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [Comms.with({ frequency: 1 }), Comms.with({ frequency: 1 })],
      }),
    });
    expect([...bp.modules.values()].map((m) => m.name)).toEqual([
      'Root',
      'Comms',
      'Comms',
    ]);
  });

  it('provides the options token inside a with() instance', () => {
    const Comms = defineModule({ name: 'Comms', options: COMMS_OPTIONS });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [Comms.with({ frequency: 1420 })],
      }),
    });
    expect([...bp.providers.values()]).toMatchObject([
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
    registerModuleClass(A, defineModule({ name: 'A', imports: [B] }));
    registerModuleClass(B, defineModule({ name: 'B', imports: [A] }));
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

  it('reports NEXUS_MODULE_OPTIONS_MISSING for a configurable module imported without with()', () => {
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
    expect(bp.providers.size).toBe(2);
  });

  it('keeps the same token provided in two modules as two providers', () => {
    const A = defineModule({ name: 'A', providers: [ReactorCore] });
    const B = defineModule({ name: 'B', providers: [ReactorCore] });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [A, B] }),
    });
    expect([...bp.providers.values()].map((p) => p.module)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('keeps two distinct classes that share a name as two providers', () => {
    const first = (() => class Probe {})();
    const second = (() => class Probe {})();
    const bp = compile({
      root: defineModule({ name: 'Root', providers: [first, second] }),
    });
    expect([...bp.providers.values()].map((p) => p.name)).toEqual([
      'Probe',
      'Probe',
    ]);
  });
});
