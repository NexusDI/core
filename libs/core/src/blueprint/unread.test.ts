import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import {
  defineModule,
  type ProviderEntry,
} from '../definitions/define-module.js';
import { all, lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import type { Blueprint, ProviderRecord } from './blueprint.js';
import { check } from '../runtime/check.js';
import { compile } from './compile.js';
import { contributionLabel } from './contribution-label.js';
import { unreadContributions } from './unread.js';
import type { ProviderView } from './views.js';

const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
const REPORT = new Token<readonly string[]>('Report');

const collector = () =>
  provide(REPORT, { useFactory: (checks) => checks, deps: [all(DIAGNOSTICS)] });

function withFeature(...providers: ProviderEntry[]) {
  const Engineering = defineModule({ name: 'Engineering', providers });
  return defineModule({ name: 'Root', imports: [Engineering] });
}

function exportingFeature(...providers: ProviderEntry[]) {
  const Engineering = defineModule({
    name: 'Engineering',
    providers,
    exports: [DIAGNOSTICS],
  });
  return defineModule({ name: 'Root', imports: [Engineering] });
}

/** The unread check on a compiled graph with every export dropped. */
function unreadOf(
  bp: Blueprint,
  edit: (records: ProviderRecord[]) => ProviderRecord[] = (r) => r,
) {
  const modules = [...bp.modules.values()].map((m) => ({
    ...m,
    exportTokens: [],
  }));
  const records = edit([...bp.providers.values()]);
  return unreadContributions(modules, records, new Map(), records);
}

describe('unread contributions', () => {
  it('rejects a private contribution in a feature module with no reader', () => {
    const root = withFeature(provide(DIAGNOSTICS, { useValue: 'reactor' }));
    expect(compileErrors(root)).toMatchObject([
      {
        code: 'NEXUS_UNREAD_CONTRIBUTION',
        token: 'Diagnostics',
        module: 'Engineering',
        provider: 'useValue #1',
      },
    ]);
  });

  it('accepts a private contribution that an all() provider of the module collects', () => {
    const root = withFeature(
      provide(DIAGNOSTICS, { useValue: 'reactor' }),
      collector(),
    );
    expect(() => compile({ root })).not.toThrow();
  });

  it('accepts a private contribution that a lazy(all()) provider of the module collects', () => {
    const root = withFeature(
      provide(DIAGNOSTICS, { useValue: 'reactor' }),
      provide(REPORT, { useFactory: () => [], deps: [lazy(all(DIAGNOSTICS))] }),
    );
    expect(() => compile({ root })).not.toThrow();
  });

  it('accepts a contribution in the root module', () => {
    const root = defineModule({
      name: 'Root',
      providers: [provide(DIAGNOSTICS, { useValue: 'reactor' })],
    });
    expect(() => compile({ root })).not.toThrow();
  });

  it('accepts a contribution the module exports', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(DIAGNOSTICS, { useValue: 'reactor' })],
      exports: [DIAGNOSTICS],
    });
    const root = defineModule({ name: 'Root', imports: [Engineering] });
    expect(() => compile({ root })).not.toThrow();
  });

  it('accepts a contribution that a property of a provider of the module collects', () => {
    const bp = compile({
      root: exportingFeature(
        provide(DIAGNOSTICS, { useValue: 'reactor' }),
        collector(),
      ),
    });
    const viaDeps = (records: ProviderRecord[]) =>
      records.map((r) => (r.token === REPORT ? { ...r, deps: [] } : r));
    const viaProperty = (records: ProviderRecord[]) =>
      records.map((r) =>
        r.token === REPORT
          ? {
              ...r,
              deps: [],
              props: [
                {
                  key: 'checks',
                  dep: { kind: 'all' as const, token: DIAGNOSTICS },
                  set: () => undefined,
                },
              ],
            }
          : r,
      );
    expect(unreadOf(bp, viaDeps)).toHaveLength(1);
    expect(unreadOf(bp, viaProperty)).toEqual([]);
  });

  it('reports two unread records as two errors in record order', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(DIAGNOSTICS, { useValue: 'reactor' }),
        provide(DIAGNOSTICS, { useFactory: () => 'hull', deps: [] }),
      ],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
    });
    const root = defineModule({
      name: 'Root',
      imports: [Engineering, Tactical],
    });
    expect(compileErrors(root)).toMatchObject([
      { module: 'Engineering', provider: 'useValue #1' },
      { module: 'Engineering', provider: 'useFactory #2' },
      { module: 'Tactical', provider: 'useValue #1' },
    ]);
  });

  it('appends its errors after the errors of pass 3', () => {
    class Missing {}
    class Needy {
      constructor(readonly missing: Missing) {}
    }
    const root = withFeature(
      provide(DIAGNOSTICS, { useValue: 'reactor' }),
      provide(Needy, { deps: [Missing] }),
    );
    expect(compileErrors(root).map((e) => e.code)).toEqual([
      'NEXUS_MISSING_PROVIDER',
      'NEXUS_UNREAD_CONTRIBUTION',
    ]);
  });
});

describe('unread contributions under compile.provider hooks', () => {
  type Answer = (provider: ProviderView) => unknown;
  const hooked = (answer: Answer) => ({
    name: 'rewriter',
    apiVersion: 1 as const,
    compile: { provider: answer },
  });
  /** What check() throws with the plugins, or undefined when it passes. */
  const checkedWith = (root: unknown, plugins: readonly object[]) => {
    try {
      check(root as never, { plugins: plugins as never });
    } catch (error) {
      return error;
    }
    return undefined;
  };
  const checkWith = (root: unknown, answer: Answer) =>
    checkedWith(root, [hooked(answer)]);
  const featureWithCollector = () =>
    withFeature(provide(DIAGNOSTICS, { useValue: 'reactor' }), collector());

  it('accepts a graph whose collector a hook replaces without a pin', () => {
    const error = checkWith(featureWithCollector(), (p) =>
      p.token === REPORT
        ? { with: provide(REPORT, { useValue: [] }) }
        : undefined,
    );
    expect(error).toBeUndefined();
  });

  it('accepts a graph whose collector a hook removes', () => {
    const error = checkWith(featureWithCollector(), (p) =>
      p.token === REPORT ? { remove: true } : undefined,
    );
    expect(error).toBeUndefined();
  });

  it('accepts a graph whose only contribution a hook removes', () => {
    const error = checkWith(
      withFeature(provide(DIAGNOSTICS, { useValue: 'reactor' })),
      (p) => (p.token === DIAGNOSTICS ? { remove: true } : undefined),
    );
    expect(error).toBeUndefined();
  });

  it('accepts a contribution when a hook gives a provider of the module a collector', () => {
    class Bridge {}
    const error = checkWith(
      withFeature(provide(DIAGNOSTICS, { useValue: 'reactor' }), Bridge),
      (p) =>
        p.token === Bridge
          ? {
              with: provide(Bridge, {
                useFactory: (checks) => checks,
                deps: [all(DIAGNOSTICS)],
              }),
            }
          : undefined,
    );
    expect(error).toBeUndefined();
  });

  it('does not count a collector in a sibling module as a reader', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(DIAGNOSTICS, { useValue: 'reactor' })],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [collector()],
    });
    const root = defineModule({
      name: 'Root',
      imports: [Engineering, Tactical],
    });
    expect(checkWith(root, () => undefined)).toMatchObject({
      errors: [{ code: 'NEXUS_UNREAD_CONTRIBUTION', module: 'Engineering' }],
    });
  });

  it('reads a collector that a tokenKey hook keys to the contribution and a rewrite then drops', () => {
    const twin = new MultiToken<string>('Diagnostics');
    const root = withFeature(
      provide(DIAGNOSTICS, { useValue: 'reactor' }),
      provide(REPORT, { useFactory: (checks) => checks, deps: [all(twin)] }),
    );
    const error = checkedWith(root, [
      {
        ...hooked((p) =>
          p.token === REPORT
            ? { with: provide(REPORT, { useValue: [] }) }
            : undefined,
        ),
        tokenKey: (token: unknown) =>
          token instanceof MultiToken ? `key:${token.description}` : undefined,
      },
    ]);
    expect(error).toBeUndefined();
  });

  it('keeps the error when no hook runs and no provider reads', () => {
    const error = checkWith(
      withFeature(provide(DIAGNOSTICS, { useValue: 'reactor' })),
      () => undefined,
    );
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_UNREAD_CONTRIBUTION' }],
    });
  });
});

describe('contributionLabel', () => {
  it('names a class record by its class and a named factory by its function', () => {
    interface IProbe {
      readonly name: string;
    }
    const PROBES = new MultiToken<IProbe>('Probes');
    class Reactor implements IProbe {
      readonly name = 'reactor';
    }
    function hullScan(): IProbe {
      return { name: 'hull' };
    }
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(PROBES, { useClass: Reactor }),
        provide(PROBES, { useFactory: hullScan, deps: [] }),
      ],
      exports: [PROBES],
    });
    const bp = compile({
      root: defineModule({ name: 'Root', imports: [Engineering] }),
    });
    const records = [...bp.providers.values()];
    const own = records.filter((r) => r.token === PROBES);
    expect(own.map((r) => contributionLabel(r, records))).toEqual([
      'Reactor',
      'hullScan',
    ]);
  });

  it('numbers an anonymous factory, a value and an alias by position among the records of the token in the module', () => {
    const NAME = new Token<string>('Name');
    const bp = compile({
      root: exportingFeature(
        provide(DIAGNOSTICS, { useValue: 'a' }),
        provide(DIAGNOSTICS, { useFactory: () => 'b', deps: [] }),
        provide(DIAGNOSTICS, { useExisting: NAME }),
        provide(NAME, { useValue: 'c' }),
      ),
    });
    const records = [...bp.providers.values()];
    const own = records.filter((r) => r.token === DIAGNOSTICS);
    expect(own.map((r) => contributionLabel(r, records))).toEqual([
      'useValue #1',
      'useFactory #2',
      'useExisting #3',
    ]);
  });
});
