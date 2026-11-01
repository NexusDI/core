import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { frequencySchema } from '../../test-support/schema.js';
import { check } from './check.js';
import type { TraceEvent } from './trace.js';

const REACTOR = new Token<{ output: number }>('ReactorCore');
class Bridge {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: { output: number }) {}
}

describe('check', () => {
  it('compiles the root and each load in order, and builds nothing', () => {
    let built = 0;
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, {
          useFactory: () => {
            built++;
            return { output: 1 };
          },
        }),
      ],
      exports: [REACTOR],
    });
    const Science = defineModule({
      name: 'Science',
      imports: [Engineering],
      providers: [Bridge],
    });
    // Science imports Engineering, so the root imports Engineering: with
    // Engineering as the root, load() would report a module import cycle.
    const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });
    expect(check(Meridian, { load: [Science] })).toEqual({
      unchecked: [],
    });
    expect(built).toBe(0);
  });

  it('accepts a load next to a module a compile.module hook replaces with a fresh object every compile', () => {
    const LOG = new MultiToken<string>('Log');
    const Telemetry = defineModule({
      name: 'Telemetry',
      providers: [provide(LOG, { useValue: 'tele' })],
      exports: [LOG],
    });
    const Root = defineModule({ name: 'Root', imports: [Telemetry] });
    const fresh = {
      name: 'fresh',
      apiVersion: 1,
      compile: {
        module: (m: unknown) =>
          m === Telemetry
            ? defineModule({
                name: 'TelemetryStub',
                providers: [provide(LOG, { useValue: 'stub' })],
                exports: [LOG],
              })
            : undefined,
      },
    } as never;
    expect(
      check(Root, {
        plugins: [fresh],
        load: [defineModule({ name: 'Other' })],
      }),
    ).toEqual({ unchecked: [] });
  });

  it('throws one BlueprintError for the first compile that fails', () => {
    const Science = defineModule({ name: 'Science', providers: [Bridge] });
    expect(
      thrown(() => check(defineModule({ name: 'Root' }), { load: [Science] })),
    ).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_MISSING_PROVIDER', requester: 'Bridge' }],
    });
  });

  it('runs compile hooks with phase check and observers see compile events', () => {
    const phases: string[] = [];
    const events: string[] = [];
    check(defineModule({ name: 'Root' }), {
      load: [defineModule({ name: 'Science' })],
      plugins: [
        {
          name: 'watch',
          apiVersion: 1,
          compile: { check: (view) => void phases.push(view.phase) },
          observe: (e) => void events.push(e.type),
        },
      ],
    });
    expect(phases).toEqual(['check', 'check']);
    expect(events).toEqual(['compile', 'compile']);
  });

  it('gives compile.check hooks a view whose root is the checked root', () => {
    const roots: string[] = [];
    check(defineModule({ name: 'Meridian' }), {
      load: [defineModule({ name: 'Science' })],
      plugins: [
        {
          name: 'roots',
          apiVersion: 1,
          compile: {
            check: (view) =>
              void roots.push(
                view.modules.find((m) => m.id === view.root)?.name ?? '',
              ),
          },
        },
      ],
    });
    expect(roots).toEqual(['Meridian', 'Meridian']);
  });

  it('reports a load that reaches a new global module as a LoadError inside the BlueprintError', () => {
    const Telemetry = defineModule({ name: 'Telemetry', global: true });
    const Wrapper = defineModule({ name: 'Wrapper', imports: [Telemetry] });
    const events: TraceEvent[] = [];
    const error = thrown(() =>
      check(defineModule({ name: 'Root' }), {
        load: [Wrapper],
        plugins: [
          { name: 'watch', apiVersion: 1, observe: (e) => events.push(e) },
        ],
      }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_LOAD_GLOBAL_MODULE', module: 'Telemetry' }],
    });
    expect(events).toMatchObject([
      { type: 'compile', phase: 'check', errors: 0 },
      { type: 'compile', phase: 'check', errors: 1 },
    ]);
  });

  it('reports a load of a module that exports a contribution as a LoadContributionError inside the BlueprintError', () => {
    const LOG = new MultiToken<string>('Log');
    const Listener = defineModule({
      name: 'Listener',
      providers: [provide(LOG, { useValue: 'own' })],
      exports: [LOG],
    });
    const error = thrown(() =>
      check(defineModule({ name: 'Root' }), { load: [Listener] }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'Listener',
          token: 'Log',
        },
      ],
    });
  });

  it('reports a loaded module whose private contribution no provider reads as an UnreadContributionError inside the BlueprintError', () => {
    const LOG = new MultiToken<string>('Log');
    const Silent = defineModule({
      name: 'Silent',
      providers: [provide(LOG, { useValue: 'own' })],
    });
    const error = thrown(() =>
      check(defineModule({ name: 'Root' }), { load: [Silent] }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_UNREAD_CONTRIBUTION',
          token: 'Log',
          module: 'Silent',
          provider: 'useValue #1',
        },
      ],
    });
  });

  it('accepts a load of a global module the root already reaches', () => {
    const Telemetry = defineModule({ name: 'Telemetry', global: true });
    const Wrapper = defineModule({ name: 'Wrapper', imports: [Telemetry] });
    expect(
      check(defineModule({ name: 'Root', imports: [Telemetry] }), {
        load: [Wrapper],
      }),
    ).toEqual({ unchecked: [] });
  });

  it('accepts a load of a module the root already imports, as load() does', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useValue: { output: 1 } })],
      exports: [REACTOR],
    });
    const Lab = defineModule({ name: 'Lab', imports: [Engineering] });
    expect(
      check(defineModule({ name: 'Root', imports: [Lab] }), {
        load: [Lab, Lab],
      }),
    ).toEqual({ unchecked: [] });
  });

  it('stops at the first failing compile and compiles no later load', () => {
    const phases: boolean[] = [];
    const Science = defineModule({ name: 'Science', providers: [Bridge] });
    thrown(() =>
      check(defineModule({ name: 'Root' }), {
        load: [Science, defineModule({ name: 'Medical' })],
        plugins: [
          {
            name: 'watch',
            apiVersion: 1,
            compile: { check: (view) => void phases.push(view.complete) },
          },
        ],
      }),
    );
    expect(phases).toEqual([true, false]);
  });

  it('calls no setup hook and runs a sync options schema once', () => {
    let setups = 0;
    let parsed = 0;
    const Configured = defineModule({
      name: 'Configured',
      options: new Token<{ level: number }>('ConfiguredOptions'),
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value: unknown) => {
            parsed++;
            return { value: value as { level: number } };
          },
        },
      },
    });
    check(defineModule({ name: 'Root' }), {
      load: [Configured.forRoot({ level: 1 })],
      plugins: [
        {
          name: 'setup',
          apiVersion: 1,
          setup: () => void setups++,
        },
      ],
    });
    expect(setups).toBe(0);
    expect(parsed).toBe(1);
  });

  it('formats the thrown BlueprintError and its inner errors with formatError', () => {
    const views: (BlueprintView | undefined)[] = [];
    const error = thrown(() =>
      check(defineModule({ name: 'Root', providers: [Bridge] }), {
        plugins: [
          {
            name: 'fmt',
            apiVersion: 1,
            formatError: (e, view) => {
              views.push(view);
              return { message: `formatted ${e.code}` };
            },
          },
        ],
      }),
    ) as Error & { errors: Error[] };
    expect(error.errors[0]?.message).toBe(
      '[NEXUS_MISSING_PROVIDER] formatted NEXUS_MISSING_PROVIDER',
    );
    expect(error.message).toBe(
      '[NEXUS_BLUEPRINT_INVALID] formatted NEXUS_BLUEPRINT_INVALID',
    );
    expect(views[0]).toMatchObject({ phase: 'check', complete: false });
  });

  it('formats a LoadError with the view of the last compile that passed', () => {
    const Telemetry = defineModule({ name: 'Telemetry', global: true });
    const views: (BlueprintView | undefined)[] = [];
    thrown(() =>
      check(defineModule({ name: 'Root' }), {
        load: [Telemetry],
        plugins: [
          {
            name: 'fmt',
            apiVersion: 1,
            formatError: (_e, view) => {
              views.push(view);
              return undefined;
            },
          },
        ],
      }),
    );
    expect(views.map((v) => v?.phase)).toEqual(['check', 'check']);
    expect(views[0]?.complete).toBe(true);
    expect(views[0]?.modules.map((m) => m.name)).toEqual(['Root']);
  });

  describe('load entries with a load import', () => {
    const CHARTS = new Token<string>('Charts');
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [provide(CHARTS, { useValue: 'sector 7' })],
      exports: [CHARTS],
    });
    class Plotter {
      static deps = [CHARTS] as const;
      constructor(readonly charts: string) {}
    }
    const Wrapper = defineModule({ name: 'Wrapper', imports: [Navigation] });
    const Root = defineModule({ name: 'Root', imports: [Wrapper] });
    const Science = defineModule({ name: 'Science', providers: [Plotter] });

    it('accepts a module with imports and compiles the load import', () => {
      expect(
        check(Root, {
          load: [{ module: Science, imports: [Navigation] }],
        }),
      ).toEqual({ unchecked: [] });
    });

    it('reports a missing provider when the entry has no load import', () => {
      expect(thrown(() => check(Root, { load: [Science] }))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [{ code: 'NEXUS_MISSING_PROVIDER' }],
      });
    });

    it.each([
      ['not-in-graph', defineModule({ name: 'Hangar' }), 'Hangar'],
      ['root', Root, 'Root'],
    ] as const)(
      'reports %s inside a BlueprintError',
      (reason, imported, name) => {
        expect(
          thrown(() =>
            check(Root, {
              load: [{ module: Science, imports: [imported] }],
            }),
          ),
        ).toMatchObject({
          code: 'NEXUS_BLUEPRINT_INVALID',
          errors: [
            {
              code: 'NEXUS_LOAD_IMPORT',
              module: 'Science',
              imported: name,
              reason,
            },
          ],
        });
      },
    );

    it('reports already-loaded for a load import on a module the root imports', () => {
      expect(
        thrown(() =>
          check(Root, {
            load: [{ module: Wrapper, imports: [Navigation] }],
          }),
        ),
      ).toMatchObject({
        errors: [{ code: 'NEXUS_LOAD_IMPORT', reason: 'already-loaded' }],
      });
    });
  });

  describe('options schemas', () => {
    const COMMS_OPTIONS = new Token<{ frequency: number; band?: string }>(
      'CommsOptions',
    );
    const RELAY = new Token<{ open: boolean }>('SubspaceRelay');
    const bad = { frequency: 'high' } as never;
    const good = { frequency: 1420 };

    function comms(name = 'Comms', schema: unknown = frequencySchema()) {
      return defineModule({
        name,
        options: COMMS_OPTIONS,
        schema: schema as ReturnType<typeof frequencySchema>,
      });
    }

    function counting(verdict: 'reject' | 'accept' = 'reject') {
      const seen = { calls: 0 };
      const schema = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value: unknown) => {
            seen.calls++;
            return verdict === 'reject'
              ? { issues: [{ message: 'no' }] }
              : { value };
          },
        },
      };
      return { seen, schema };
    }

    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('throws NEXUS_BLUEPRINT_INVALID with NEXUS_INVALID_MODULE_OPTIONS for a forRoot() value its sync schema rejects', () => {
      let built = 0;
      const Comms = defineModule({
        name: 'Comms',
        options: COMMS_OPTIONS,
        schema: frequencySchema(),
        providers: [
          provide(RELAY, {
            useFactory: () => {
              built++;
              return { open: true };
            },
          }),
        ],
      });
      const root = defineModule({
        name: 'Root',
        imports: [Comms.forRoot(bad)],
      });
      expect(thrown(() => check(root))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_INVALID_MODULE_OPTIONS',
            module: 'Comms',
            issues: [{ message: 'expected a number', path: ['frequency'] }],
          },
        ],
      });
      expect(built).toBe(0);
    });

    it('returns no unchecked module when every schema ran', () => {
      const report = check(
        defineModule({ name: 'Root', imports: [comms().forRoot(good)] }),
      );
      expect(report).toEqual({ unchecked: [] });
      expect(Object.isFrozen(report)).toBe(true);
      expect(Object.isFrozen(report.unchecked)).toBe(true);
    });

    it('reports every rejected value of one compile in record order', () => {
      const Comms = comms('Comms');
      const Uplink = comms('Uplink');
      const error = thrown(() =>
        check(
          defineModule({
            name: 'Root',
            imports: [Comms.forRoot(bad), Uplink.forRoot(bad)],
          }),
        ),
      ) as Error & { errors: { module: string }[] };
      expect(error.errors.map((each) => each.module)).toEqual([
        'Comms',
        'Uplink',
      ]);
    });

    it('lists a schema whose validate returns a promise as unchecked and observes its rejection', async () => {
      let calls = 0;
      const Comms = comms('Comms', {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => {
            calls++;
            return Promise.reject(new Error('late'));
          },
        },
      });
      const report = check(
        defineModule({ name: 'Root', imports: [Comms.forRoot(good)] }),
      );
      expect(report.unchecked).toEqual([
        { module: 'Comms', reason: 'async-schema' },
      ]);
      expect(Object.isFrozen(report.unchecked[0])).toBe(true);
      expect(calls).toBe(1);
      await tick();
    });

    it('lists a forRootAsync() module with a schema as unchecked and runs no factory', () => {
      let factories = 0;
      const report = check(
        defineModule({
          name: 'Root',
          imports: [
            comms().forRootAsync({
              useFactory: () => {
                factories++;
                return good;
              },
              deps: [],
            }),
          ],
        }),
      );
      expect(factories).toBe(0);
      expect(report.unchecked).toEqual([
        { module: 'Comms', reason: 'for-root-async' },
      ]);
      expect(Object.isFrozen(report.unchecked[0])).toBe(true);
    });

    it('lists nothing for a forRootAsync() module without a schema', () => {
      const Plain = defineModule({ name: 'Plain', options: COMMS_OPTIONS });
      expect(
        check(
          defineModule({
            name: 'Root',
            imports: [Plain.forRootAsync({ useFactory: () => good, deps: [] })],
          }),
        ),
      ).toEqual({ unchecked: [] });
    });

    it('discards the output of a schema that transforms its value', () => {
      const Comms = comms('Comms', {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => ({ value: { frequency: 1, band: 'rewritten' } }),
        },
      });
      expect(
        check(defineModule({ name: 'Root', imports: [Comms.forRoot(good)] })),
      ).toEqual({ unchecked: [] });
    });

    it('lists an async-schema module and a forRootAsync() module in compile order', async () => {
      const Uplink = comms('Uplink', {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => Promise.resolve({ value: good }),
        },
      });
      const Comms = comms('Comms');
      const report = check(
        defineModule({
          name: 'Root',
          imports: [
            Uplink.forRoot(good),
            Comms.forRootAsync({ useFactory: () => good, deps: [] }),
          ],
        }),
      );
      expect(report.unchecked).toEqual([
        { module: 'Uplink', reason: 'async-schema' },
        { module: 'Comms', reason: 'for-root-async' },
      ]);
      await tick();
    });

    it('propagates the exception a schema throws', () => {
      const boom = new Error('schema broke');
      const Comms = comms('Comms', {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => {
            throw boom;
          },
        },
      });
      const root = defineModule({
        name: 'Root',
        imports: [Comms.forRoot(good)],
      });
      expect(thrown(() => check(root))).toBe(boom);
    });

    it("checks a load entry's forRoot() value", () => {
      const error = thrown(() =>
        check(defineModule({ name: 'Root' }), {
          load: [comms().forRoot(bad)],
        }),
      ) as Error & { errors: { code: string }[] };
      expect(error.errors.map((each) => each.code)).toEqual([
        'NEXUS_INVALID_MODULE_OPTIONS',
      ]);
    });

    it('runs no schema when a load entry fails to compile', () => {
      const { seen, schema } = counting();
      const Science = defineModule({ name: 'Science', providers: [Bridge] });
      const error = thrown(() =>
        check(
          defineModule({
            name: 'Root',
            imports: [comms('Comms', schema).forRoot(bad)],
          }),
          { load: [Science] },
        ),
      ) as Error & { errors: { code: string }[] };
      expect(error.errors.map((each) => each.code)).toEqual([
        'NEXUS_MISSING_PROVIDER',
      ]);
      expect(seen.calls).toBe(0);
    });

    it('reports rejected values of the root and of a load entry in one BlueprintError', () => {
      const error = thrown(() =>
        check(
          defineModule({
            name: 'Root',
            imports: [comms('Comms').forRoot(bad)],
          }),
          { load: [comms('Uplink').forRoot(bad)] },
        ),
      ) as Error & { errors: { code: string; module: string }[] };
      expect(error.errors.map((each) => each.code)).toEqual([
        'NEXUS_INVALID_MODULE_OPTIONS',
        'NEXUS_INVALID_MODULE_OPTIONS',
      ]);
      expect(error.errors.map((each) => each.module)).toEqual([
        'Comms',
        'Uplink',
      ]);
    });

    it('runs a root schema once across every load compile', () => {
      const { seen, schema } = counting('accept');
      check(
        defineModule({
          name: 'Root',
          imports: [comms('Comms', schema).forRoot(good)],
        }),
        {
          load: [
            defineModule({ name: 'Science' }),
            defineModule({ name: 'Lab' }),
          ],
        },
      );
      expect(seen.calls).toBe(1);
    });

    it('runs no schema when the graph has an error', () => {
      const { seen, schema } = counting();
      const error = thrown(() =>
        check(
          defineModule({
            name: 'Root',
            imports: [comms('Comms', schema).forRoot(bad)],
            providers: [Bridge],
          }),
        ),
      ) as Error & { errors: { code: string }[] };
      expect(error.errors.map((each) => each.code)).toEqual([
        'NEXUS_MISSING_PROVIDER',
      ]);
      expect(seen.calls).toBe(0);
    });

    it('formats the schema failure with the view of the compile that passed', () => {
      const views: (BlueprintView | undefined)[] = [];
      thrown(() =>
        check(defineModule({ name: 'Root', imports: [comms().forRoot(bad)] }), {
          plugins: [
            {
              name: 'fmt',
              apiVersion: 1,
              formatError: (_error, view) => {
                views.push(view);
                return undefined;
              },
            },
          ],
        }),
      );
      expect(views.length).toBeGreaterThan(0);
      expect(
        views[0]?.providers.some((each) => each.name.includes('CommsOptions')),
      ).toBe(true);
    });
  });
});
