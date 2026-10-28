import { describe, expect, it } from 'vitest';

import { compileErrors, idOf, visible } from '../../test-support/compile.js';
import {
  defineModule,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { all } from '../definitions/modifiers.js';
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

  it('reports NEXUS_AMBIGUOUS_PROVIDER for two forRoot() instances that export one token', () => {
    const OPTIONS = new Token<number>('Frequency');
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      exports: [OPTIONS],
    });
    expect(
      compileErrors(
        defineModule({
          name: 'Root',
          imports: [Comms.forRoot(1), Comms.forRoot(2)],
        }),
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

  it('lists MultiToken contributions in the order the walk first meets their modules, then providers order', () => {
    const Sensors = defineModule({
      name: 'Sensors',
      providers: [
        provide(DIAGNOSTICS, { useValue: 'sensors1' }),
        provide(DIAGNOSTICS, { useValue: 'sensors2' }),
      ],
      exports: [DIAGNOSTICS],
    });
    const Weapons = defineModule({
      name: 'Weapons',
      providers: [provide(DIAGNOSTICS, { useValue: 'weapons' })],
      exports: [DIAGNOSTICS],
    });
    // The walk meets Sensors through Root before it reaches Bridge, so
    // Sensors comes first in Bridge's list although Bridge imports it last.
    // Bridge's private record sorts in by its index.
    const Bridge = defineModule({
      name: 'Bridge',
      imports: [Weapons, Sensors],
      providers: [provide(DIAGNOSTICS, { useValue: 'bridge' })],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Sensors, Bridge] }),
    });
    const values = (module: string): unknown[] =>
      visible(bp, module, DIAGNOSTICS).map((id) => bp.providers.get(id)?.value);
    expect(values('Bridge')).toEqual([
      'sensors1',
      'sensors2',
      'bridge',
      'weapons',
    ]);
    expect(values('Root')).toEqual(['sensors1', 'sensors2', 'weapons']);
  });

  it('keeps a MultiToken contribution its module does not export inside that module', () => {
    const Sensors = defineModule({
      name: 'Sensors',
      providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Sensors] }),
    });
    const record = idOf(bp, DIAGNOSTICS, 'Sensors');
    expect(visible(bp, 'Sensors', DIAGNOSTICS)).toEqual([record]);
    expect(visible(bp, 'Root', DIAGNOSTICS)).toEqual([]);
  });

  it('shows every published MultiToken contribution to a module no contributor exports to', () => {
    const Engine = defineModule({ name: 'Engine' });
    const Plugins = defineModule({
      name: 'Plugins',
      imports: [Engine],
      providers: [provide(DIAGNOSTICS, { useValue: 'plugin' })],
      exports: [DIAGNOSTICS],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Engine, Plugins] }),
    });
    expect(visible(bp, 'Engine', DIAGNOSTICS)).toEqual([
      idOf(bp, DIAGNOSTICS, 'Plugins'),
    ]);
  });

  it('accepts exports: [T] for a MultiToken the module has no record of, and publishes nothing', () => {
    const Sensors = defineModule({
      name: 'Sensors',
      providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
    });
    const Relay = defineModule({
      name: 'Relay',
      imports: [Sensors],
      exports: [DIAGNOSTICS],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Relay] }),
    });
    const relay = [...bp.modules.values()].find((m) => m.name === 'Relay');
    expect(bp.moduleExports.get(relay?.id ?? '')).toEqual([]);
    expect(bp.exportedTokens.get(relay?.id ?? '')?.has(DIAGNOSTICS)).toBe(
      false,
    );
    expect(visible(bp, 'Root', DIAGNOSTICS)).toEqual([]);
    expect(visible(bp, 'Relay', DIAGNOSTICS)).toEqual([]);
  });

  it('publishes nothing of a MultiToken through a module re-export', () => {
    const Sensors = defineModule({
      name: 'Sensors',
      providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
    });
    const Relay = defineModule({
      name: 'Relay',
      imports: [Sensors],
      exports: [Sensors],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Relay] }),
    });
    const relay = [...bp.modules.values()].find((m) => m.name === 'Relay');
    expect(bp.exportedTokens.get(relay?.id ?? '')?.has(DIAGNOSTICS)).toBe(
      false,
    );
    expect(visible(bp, 'Root', DIAGNOSTICS)).toEqual([]);
  });

  it('reports NEXUS_LIFETIME_VIOLATION for a singleton collector over a scoped contribution far away', () => {
    interface IDiagnostics {
      readonly checks: readonly string[];
    }
    const REPORT = new Token<IDiagnostics>('Report');
    const Sensors = defineModule({
      name: 'Sensors',
      providers: [
        provide(DIAGNOSTICS, {
          useFactory: () => 'sensors',
          deps: [],
          lifetime: 'scoped',
        }),
      ],
      exports: [DIAGNOSTICS],
    });
    const Reporting = defineModule({
      name: 'Reporting',
      providers: [
        provide(REPORT, {
          useFactory: (checks) => ({ checks }),
          deps: [all(DIAGNOSTICS)],
        }),
      ],
    });
    expect(
      compileErrors(
        defineModule({ name: 'Root', imports: [Reporting, Sensors] }),
      ),
    ).toMatchObject([
      {
        code: 'NEXUS_LIFETIME_VIOLATION',
        path: ['Report', 'Diagnostics'],
        lifetimes: ['singleton', 'scoped'],
      },
    ]);
  });

  it('reports NEXUS_CIRCULAR_DEPENDENCY for a collector and a contributor that depends on it', () => {
    interface IDiagnostics {
      readonly checks: readonly string[];
    }
    const REPORT = new Token<IDiagnostics>('Report');
    const Reporting = defineModule({
      name: 'Reporting',
      providers: [
        provide(REPORT, {
          useFactory: (checks) => ({ checks }),
          deps: [all(DIAGNOSTICS)],
        }),
      ],
      exports: [REPORT],
    });
    const Sensors = defineModule({
      name: 'Sensors',
      imports: [Reporting],
      providers: [
        provide(DIAGNOSTICS, {
          useFactory: (report) => `sensors after ${report.checks.length}`,
          deps: [REPORT],
        }),
      ],
      exports: [DIAGNOSTICS],
    });
    expect(
      compileErrors(defineModule({ name: 'Root', imports: [Sensors] })),
    ).toMatchObject([
      {
        code: 'NEXUS_CIRCULAR_DEPENDENCY',
        path: ['Diagnostics', 'Report', 'Diagnostics'],
      },
    ]);
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

  it('lists a MultiToken in exportedTokens only for the module that publishes a record of it', () => {
    const A = defineModule({
      name: 'A',
      providers: [provide(DIAGNOSTICS, { useValue: 'a' })],
      exports: [DIAGNOSTICS],
    });
    const K1 = defineModule({ name: 'K1', imports: [A], exports: [A] });
    const K2 = defineModule({ name: 'K2', imports: [A], exports: [A] });
    const Global = defineModule({
      name: 'Global',
      global: true,
      imports: [K1, K2],
      exports: [K1, K2],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Global] }),
    });
    const idOfModule = (name: string): string | undefined =>
      [...bp.modules.values()].find((m) => m.name === name)?.id;
    for (const [name, publishes] of [
      ['A', true],
      ['K1', false],
      ['K2', false],
      ['Global', false],
    ] as const) {
      const id = idOfModule(name);
      expect(id).toBeDefined();
      expect(bp.exportedTokens.get(id ?? '')?.has(DIAGNOSTICS), name).toBe(
        publishes,
      );
    }
  });

  it('shows the published set of a MultiToken to every module of a re-export cycle a global module closes', () => {
    const A = defineModule({
      name: 'A',
      providers: [provide(DIAGNOSTICS, { useValue: 'a' })],
      exports: [DIAGNOSTICS],
    });
    // K1 publishes its record. K2 keeps its record private: its re-export
    // of A publishes nothing of DIAGNOSTICS.
    const K1 = defineModule({
      name: 'K1',
      imports: [A],
      providers: [provide(DIAGNOSTICS, { useValue: 'k1' })],
      exports: [DIAGNOSTICS],
    });
    const K2 = defineModule({
      name: 'K2',
      imports: [A],
      providers: [provide(DIAGNOSTICS, { useValue: 'k2' })],
      exports: [A],
    });
    const Global = defineModule({
      name: 'Global',
      global: true,
      imports: [K1, K2],
      exports: [K1, K2],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Global] }),
    });
    const published = [idOf(bp, DIAGNOSTICS, 'K1'), idOf(bp, DIAGNOSTICS, 'A')];
    for (const name of ['A', 'K1', 'Global', 'Root'])
      expect(visible(bp, name, DIAGNOSTICS), name).toEqual(published);
    expect(visible(bp, 'K2', DIAGNOSTICS)).toEqual([
      ...published,
      idOf(bp, DIAGNOSTICS, 'K2'),
    ]);
  });

  it('resolves a plain token that enters a re-export cycle from one provider', () => {
    const A = defineModule({
      name: 'A',
      providers: [provide(LOGGER, { useValue: 'a' })],
      exports: [LOGGER],
    });
    const K1 = defineModule({ name: 'K1', imports: [A], exports: [LOGGER] });
    const K2 = defineModule({ name: 'K2', imports: [A], exports: [LOGGER] });
    const Global = defineModule({
      name: 'Global',
      global: true,
      imports: [K1, K2],
      exports: [K1, K2],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Global] }),
    });
    const provider = idOf(bp, LOGGER, 'A');
    for (const name of ['K1', 'K2', 'Global', 'Root'])
      expect(visible(bp, name, LOGGER)).toEqual([provider]);
  });

  it('reports NEXUS_AMBIGUOUS_PROVIDER for a plain token that enters a re-export cycle from two providers', () => {
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
    const K1 = defineModule({ name: 'K1', imports: [A], exports: [LOGGER] });
    const K2 = defineModule({ name: 'K2', imports: [B], exports: [LOGGER] });
    const Global = defineModule({
      name: 'Global',
      global: true,
      imports: [K1, K2],
      exports: [K1, K2],
    });
    const errors = compileErrors(
      defineModule({ name: 'Root', imports: [Global] }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: 'NEXUS_AMBIGUOUS_PROVIDER',
        module: 'K1',
      }),
    );
    expect(errors.map((e) => e.code)).not.toContain('NEXUS_INVALID_EXPORT');
  });

  it('reports pass 2 errors by module walk order, then token first-seen order, then the export checks', () => {
    const FREQUENCY = new Token<number>('Frequency');
    const CHANNEL = new Token<number>('Channel');
    const source = (name: string): ModuleDefinition =>
      defineModule({
        name,
        providers: [provide(LOGGER, { useValue: name })],
        exports: [LOGGER],
      });
    // Mid sees Logger from X and Y, and exports it. Root looks Logger up
    // through Mid, but Mid comes after Root in walk order.
    const Mid = defineModule({
      name: 'Mid',
      imports: [source('X'), source('Y')],
      exports: [LOGGER, ShieldGrid],
    });
    const radio = (name: string): ModuleDefinition =>
      defineModule({
        name,
        providers: [
          provide(FREQUENCY, { useValue: 1 }),
          provide(CHANNEL, { useValue: 2 }),
        ],
        exports: [FREQUENCY, CHANNEL],
      });
    const errors = compileErrors(
      defineModule({
        name: 'Root',
        imports: [Mid, radio('P'), radio('Q')],
        exports: [ReactorCore],
      }),
    );
    expect(errors).toHaveLength(5);
    expect(errors).toMatchObject([
      { code: 'NEXUS_AMBIGUOUS_PROVIDER', module: 'Root', token: 'Frequency' },
      { code: 'NEXUS_AMBIGUOUS_PROVIDER', module: 'Root', token: 'Channel' },
      { code: 'NEXUS_AMBIGUOUS_PROVIDER', module: 'Mid', token: 'Logger' },
      { code: 'NEXUS_INVALID_EXPORT', module: 'Root', token: 'ReactorCore' },
      { code: 'NEXUS_INVALID_EXPORT', module: 'Mid', token: 'ShieldGrid' },
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
