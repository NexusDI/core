import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { TraceEvent } from './trace.js';

const REACTOR = new Token<{ output: number }>('ReactorCore');
class Bridge {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: { output: number }) {}
}

describe('Nexus.check', () => {
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
    expect(Nexus.check(Meridian, { load: [Science] })).toBeUndefined();
    expect(built).toBe(0);
  });

  it('throws one BlueprintError for the first compile that fails', () => {
    const Science = defineModule({ name: 'Science', providers: [Bridge] });
    expect(
      thrown(() =>
        Nexus.check(defineModule({ name: 'Root' }), { load: [Science] }),
      ),
    ).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_MISSING_PROVIDER', requester: 'Bridge' }],
    });
  });

  it('runs compile hooks with phase check and observers see compile events', () => {
    const phases: string[] = [];
    const events: string[] = [];
    Nexus.check(defineModule({ name: 'Root' }), {
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
    Nexus.check(defineModule({ name: 'Meridian' }), {
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
      Nexus.check(defineModule({ name: 'Root' }), {
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

  it('accepts a load of a global module the root already reaches', () => {
    const Telemetry = defineModule({ name: 'Telemetry', global: true });
    const Wrapper = defineModule({ name: 'Wrapper', imports: [Telemetry] });
    expect(
      Nexus.check(defineModule({ name: 'Root', imports: [Telemetry] }), {
        load: [Wrapper],
      }),
    ).toBeUndefined();
  });

  it('accepts a load of a module the root already imports, as load() does', () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(REACTOR, { useValue: { output: 1 } })],
      exports: [REACTOR],
    });
    const Lab = defineModule({ name: 'Lab', imports: [Engineering] });
    expect(
      Nexus.check(defineModule({ name: 'Root', imports: [Lab] }), {
        load: [Lab, Lab],
      }),
    ).toBeUndefined();
  });

  it('stops at the first failing compile and compiles no later load', () => {
    const phases: boolean[] = [];
    const Science = defineModule({ name: 'Science', providers: [Bridge] });
    thrown(() =>
      Nexus.check(defineModule({ name: 'Root' }), {
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

  it('calls no setup and runs no options schema', () => {
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
    Nexus.check(defineModule({ name: 'Root' }), {
      load: [Configured.with({ level: 1 })],
      plugins: [
        {
          name: 'setup',
          apiVersion: 1,
          setup: () => void setups++,
        },
      ],
    });
    expect(setups).toBe(0);
    expect(parsed).toBe(0);
  });

  it('formats the thrown BlueprintError and its inner errors with formatError', () => {
    const views: (BlueprintView | undefined)[] = [];
    const error = thrown(() =>
      Nexus.check(defineModule({ name: 'Root', providers: [Bridge] }), {
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
      Nexus.check(defineModule({ name: 'Root' }), {
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
});
