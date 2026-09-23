import { describe, expect, it } from 'vitest';

import { compileErrors, idOf, visible } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
import { compile } from './compile.js';

class ReactorCore {}
class ShieldGrid {}
class SubspaceLink {}
const LOGGER = new Token<string>('Logger');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

describe('compile', () => {
  it('shows a module its own providers and the exports of its imports', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore, ShieldGrid],
      exports: [ReactorCore],
    });
    const bp = compile({
      root: defineModule({ name: 'Meridian', imports: [Engineering] }),
    });
    expect(visible(bp, 'Meridian', ReactorCore)).toEqual([
      idOf(bp, ReactorCore),
    ]);
    expect(visible(bp, 'Meridian', ShieldGrid)).toEqual([]);
    expect(visible(bp, 'Engineering', ShieldGrid)).toEqual([
      idOf(bp, ShieldGrid),
    ]);
  });

  it('shadows an imported export with the module own provider of the same token', () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [provide(LOGGER, { useValue: 'comms' })],
      exports: [LOGGER],
    });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [Comms],
        providers: [provide(LOGGER, { useValue: 'root' })],
      }),
    });
    expect(visible(bp, 'Root', LOGGER)).toEqual([idOf(bp, LOGGER, 'Root')]);
  });

  it('shows the same provider through a re-exported module without ambiguity', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      imports: [Engineering],
      exports: [Engineering],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Tactical, Engineering] }),
    });
    expect(visible(bp, 'Root', ReactorCore)).toEqual([idOf(bp, ReactorCore)]);
  });

  it('re-exports an imported token by naming it', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      imports: [Engineering],
      exports: [ReactorCore],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Tactical] }),
    });
    expect(visible(bp, 'Root', ReactorCore)).toEqual([idOf(bp, ReactorCore)]);
  });

  it('reports NEXUS_AMBIGUOUS_PROVIDER when two imports export different providers of one token', () => {
    const A = defineModule({
      name: 'A',
      providers: [provide(LOGGER, { useValue: 'a' })],
      exports: [LOGGER],
    });
    const B = defineModule({
      name: 'B',
      providers: [provide(LOGGER, { useValue: 'b' })],
      exports: [LOGGER],
    });
    expect(
      compileErrors(defineModule({ name: 'Root', imports: [A, B] })),
    ).toMatchObject([
      {
        code: 'NEXUS_AMBIGUOUS_PROVIDER',
        token: 'Logger',
        module: 'Root',
        candidates: ['A', 'B'],
      },
    ]);
  });

  it('reports NEXUS_AMBIGUOUS_PROVIDER for two with() instances that export one token', () => {
    const OPTIONS = new Token<number>('Frequency');
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      exports: [OPTIONS],
    });
    expect(
      compileErrors(
        defineModule({ name: 'Root', imports: [Comms.with(1), Comms.with(2)] }),
      ),
    ).toMatchObject([
      {
        code: 'NEXUS_AMBIGUOUS_PROVIDER',
        token: 'Frequency',
        module: 'Root',
        candidates: ['Comms', 'Comms'],
      },
    ]);
  });

  it('merges MultiToken contributions in walk order, then declaration order', () => {
    const A = defineModule({
      name: 'A',
      providers: [
        provide(DIAGNOSTICS, { useValue: 'a1' }),
        provide(DIAGNOSTICS, { useValue: 'a2' }),
      ],
      exports: [DIAGNOSTICS],
    });
    const B = defineModule({
      name: 'B',
      providers: [provide(DIAGNOSTICS, { useValue: 'b' })],
      exports: [DIAGNOSTICS],
    });
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [A, B],
        providers: [provide(DIAGNOSTICS, { useValue: 'root' })],
      }),
    });
    const values = visible(bp, 'Root', DIAGNOSTICS).map(
      (id) => bp.providers.get(id)?.value,
    );
    expect(values).toEqual(['root', 'a1', 'a2', 'b']);
  });

  it('shows the exports of a global module everywhere without an import', () => {
    const Telemetry = defineModule({
      name: 'Telemetry',
      global: true,
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    const Engineering = defineModule({ name: 'Engineering' });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Telemetry, Engineering] }),
    });
    expect(visible(bp, 'Engineering', ReactorCore)).toEqual([
      idOf(bp, ReactorCore),
    ]);
  });

  it('shows REQUEST in every module', () => {
    const bp = compile({
      root: defineModule({
        name: 'Root',
        imports: [defineModule({ name: 'Leaf' })],
      }),
    });
    expect(visible(bp, 'Leaf', REQUEST)).toEqual(['request']);
    expect(bp.providers.get('request')).toMatchObject({
      kind: 'value',
      lifetime: 'scoped',
      name: 'REQUEST',
    });
  });

  it('reports NEXUS_INVALID_EXPORT for a token the module cannot see', () => {
    expect(
      compileErrors(defineModule({ name: 'Comms', exports: [SubspaceLink] })),
    ).toMatchObject([
      { code: 'NEXUS_INVALID_EXPORT', token: 'SubspaceLink', module: 'Comms' },
    ]);
  });

  it('reports NEXUS_INVALID_EXPORT for a module the exporter does not import', () => {
    const Engineering = defineModule({ name: 'Engineering' });
    expect(
      compileErrors(defineModule({ name: 'Comms', exports: [Engineering] })),
    ).toMatchObject([
      { code: 'NEXUS_INVALID_EXPORT', token: 'Engineering', module: 'Comms' },
    ]);
  });

  it('lists provider ids and module ids in moduleExports', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    const bp = compile({
      root: defineModule({
        name: 'Tactical',
        imports: [Engineering],
        exports: [Engineering],
      }),
    });
    expect(bp.moduleExports.get('m0')).toEqual(['m1']);
    expect(bp.moduleExports.get('m1')).toEqual([idOf(bp, ReactorCore)]);
  });
});
