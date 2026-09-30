import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { coreLine } from '../../test-support/modes.js';
import { observer } from '../../test-support/observe.js';
import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import {
  BlueprintError,
  DisposedError,
  errorBase,
  MissingProviderError,
  type ErrorText,
  type NearMiss,
  type NexusError,
} from '../errors/index.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin } from './plugins.js';

class ReactorCore {}
const NAV_CHARTS = new Token<string>('NavCharts');
const Root = defineModule({ name: 'Root', providers: [ReactorCore] });

type Format = (
  error: NexusError,
  view: BlueprintView | undefined,
) => ErrorText | undefined;

const formatter = (name: string, formatError: Format): NexusPlugin => ({
  name,
  apiVersion: 1,
  formatError,
});

/** A formatter that writes `<name>: <code>` and records every call. */
function recording(name: string, calls: string[]): NexusPlugin {
  return formatter(name, (error) => {
    calls.push(`${name} ${error.code}`);
    return { message: `${name}: ${error.code}` };
  });
}

describe('formatThrown', () => {
  it('writes the code, the message, each hint and the fix', async () => {
    const ship = await Nexus.create(Root, {
      plugins: [
        formatter('text', () => ({
          message: 'no NavCharts here.',
          hints: ['Tactical provides it.', 'Tactical keeps it private.'],
          fix: 'export it from Tactical.',
        })),
      ],
    });
    expect((thrown(() => ship.get(NAV_CHARTS)) as Error).message).toBe(
      '[NEXUS_MISSING_PROVIDER] no NavCharts here.\n' +
        '  Tactical provides it.\n' +
        '  Tactical keeps it private.\n' +
        '  Fix: export it from Tactical.',
    );
  });

  it('leaves the line when a hook throws', async () => {
    const ship = await Nexus.create(Root, {
      plugins: [
        formatter('broken', () => {
          throw new Error('formatter offline');
        }),
      ],
    });
    const error = thrown(() => ship.get(NAV_CHARTS)) as NexusError;
    expect(error).toBeInstanceOf(MissingProviderError);
    expect(error.message).toBe(coreLine(error));
  });

  it('leaves the line when a hook returns something other than text', async () => {
    const ship = await Nexus.create(Root, {
      plugins: [formatter('odd', () => ({ message: 42 }) as never)],
    });
    const error = thrown(() => ship.get(NAV_CHARTS)) as NexusError;
    expect(error.message).toBe(coreLine(error));
  });

  it('lets the first hook that returns text decide, in plugin order', async () => {
    const calls: string[] = [];
    const ship = await Nexus.create(Root, {
      plugins: [
        formatter('silent', (error) => {
          calls.push(`silent ${error.code}`);
          return undefined;
        }),
        recording('first', calls),
        recording('second', calls),
      ],
    });
    const error = thrown(() => ship.get(NAV_CHARTS)) as Error;
    expect(error.message).toBe(
      '[NEXUS_MISSING_PROVIDER] first: NEXUS_MISSING_PROVIDER',
    );
    expect(calls).toEqual([
      'silent NEXUS_MISSING_PROVIDER',
      'first NEXUS_MISSING_PROVIDER',
    ]);
  });

  it('formats an error once, when a second operation rethrows it', async () => {
    const calls: string[] = [];
    const RETHROW = new Token<string>('Rethrow');
    const caught: { error?: unknown } = {};
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(RETHROW, {
            useFactory: (): string => {
              throw caught.error;
            },
            lifetime: 'transient',
          }),
        ],
      }),
      { plugins: [recording('text', calls)] },
    );
    const first = thrown(() => ship.get(NAV_CHARTS));
    caught.error = first;
    expect(thrown(() => ship.get(RETHROW))).toBe(first);
    expect((first as Error).message).toBe(
      '[NEXUS_MISSING_PROVIDER] text: NEXUS_MISSING_PROVIDER',
    );
    expect(calls).toEqual(['text NEXUS_MISSING_PROVIDER']);
  });

  it('formats the inner errors of a BlueprintError before the aggregate', async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const error = (await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [null as never, 42 as never],
        }),
        {
          plugins: [
            formatter('text', (formatted) => {
              calls.push(formatted.code);
              if (!(formatted instanceof BlueprintError))
                return { message: `inner ${calls.length}` };
              lines.push(...formatted.errors.map((inner) => inner.message));
              return { message: 'aggregate' };
            }),
          ],
        },
      ),
    )) as BlueprintError;
    expect(calls).toEqual([
      'NEXUS_INVALID_PROVIDER',
      'NEXUS_INVALID_PROVIDER',
      'NEXUS_BLUEPRINT_INVALID',
    ]);
    expect(lines).toEqual([
      '[NEXUS_INVALID_PROVIDER] inner 1',
      '[NEXUS_INVALID_PROVIDER] inner 2',
    ]);
    expect(error.message).toBe('[NEXUS_BLUEPRINT_INVALID] aggregate');
  });

  it('rebuilds the aggregate line from the formatted inner errors when no hook formats the aggregate', async () => {
    const error = (await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [null as never, 42 as never],
        }),
        {
          plugins: [
            formatter('inner', (formatted) =>
              formatted instanceof BlueprintError
                ? undefined
                : { message: `inner ${formatted.code}` },
            ),
          ],
        },
      ),
    )) as BlueprintError;
    expect(error.message.split('\n')).toEqual([
      '[NEXUS_BLUEPRINT_INVALID] 2 errors. https://nexus.js.org/errors/NEXUS_BLUEPRINT_INVALID',
      '  [NEXUS_INVALID_PROVIDER] inner NEXUS_INVALID_PROVIDER',
      '  [NEXUS_INVALID_PROVIDER] inner NEXUS_INVALID_PROVIDER',
    ]);
  });

  it('leaves an error that owns its text, such as one a factory raises with new Token()', async () => {
    const DESCRIBED = new Token<Token<string>>('Described');
    const calls: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(DESCRIBED, {
            useFactory: () => new Token<string>(''),
            lifetime: 'transient',
          }),
        ],
      }),
      { plugins: [recording('before', calls), recording('after', calls)] },
    );
    const error = thrown(() => ship.get(DESCRIBED)) as NexusError;
    expect(error.message).toBe(
      '[NEXUS_INVALID_TOKEN] the string "" is not a token description. A Token needs a non-empty description string.',
    );
    expect(error).toMatchObject({ reason: 'bad-description' });
    expect(calls).toEqual([]);
  });

  it('formats a plugin registration error with the plugins that passed validation, and no view', async () => {
    const views: (BlueprintView | undefined)[] = [];
    const error = (await rejected(
      Nexus.create(Root, {
        plugins: [
          formatter('text', (formatted, view) => {
            views.push(view);
            return { message: `text ${formatted.code}` };
          }),
          { name: 'broken', apiVersion: 1, formatError: 'loud' } as never,
        ],
      }),
    )) as BlueprintError;
    expect(error).toBeInstanceOf(BlueprintError);
    expect(error.errors).toMatchObject([
      { code: 'NEXUS_PLUGIN_INVALID', plugin: 'broken', reason: 'bad-hook' },
    ]);
    expect(error.errors[0]?.message).toBe(
      '[NEXUS_PLUGIN_INVALID] text NEXUS_PLUGIN_INVALID',
    );
    expect(error.message).toBe(
      '[NEXUS_BLUEPRINT_INVALID] text NEXUS_BLUEPRINT_INVALID',
    );
    expect(views).toEqual([undefined, undefined]);
  });

  it('fills nearMisses from the text and keeps every other field', async () => {
    const nearMisses = [{ kind: 'not-imported', module: 'Tactical' }] as const;
    const ship = await Nexus.create(Root, {
      plugins: [
        formatter('text', () => ({
          message: 'not here.',
          nearMisses,
          token: 'Rewritten',
        })),
      ],
    });
    const error = thrown(() => ship.get(NAV_CHARTS)) as MissingProviderError;
    expect({ ...error, code: error.code }).toEqual({
      token: 'NavCharts',
      requester: null,
      module: 'Root',
      entry: null,
      nearMisses,
      code: 'NEXUS_MISSING_PROVIDER',
    });
  });

  /** The error `raise` builds, reported from a compile.check hook and formatted with `nearMisses`. */
  async function checkedWith(
    raise: () => NexusError,
    nearMisses: readonly NearMiss[],
  ): Promise<NexusError> {
    const failed = await rejected(
      Nexus.create(Root, {
        plugins: [
          {
            name: 'acme-docking',
            apiVersion: 1,
            compile: { check: (_view, report) => report(raise()) },
          },
          formatter('text', () => ({ message: 'no berth.', nearMisses })),
        ],
      }),
    );
    const inner = (failed as BlueprintError).errors[0];
    if (inner === undefined) throw new Error('expected one inner error');
    return inner;
  }

  const DOCKING_DOCS = 'https://acme.example/errors/';
  const nearBerth = [{ kind: 'not-imported', module: 'Docking' }] as const;

  it('writes nearMisses back to a third-party error that has the field', async () => {
    class BerthMissingError extends errorBase<
      'ACME_BERTH_MISSING',
      { berth: string; nearMisses: readonly NearMiss[] }
    >('ACME_BERTH_MISSING', 'BerthMissingError', DOCKING_DOCS) {}
    const error = await checkedWith(
      () => new BerthMissingError({ berth: 'B7', nearMisses: [] }),
      nearBerth,
    );
    expect(error).toBeInstanceOf(BerthMissingError);
    expect({ ...error }).toEqual({ berth: 'B7', nearMisses: nearBerth });
  });

  it('adds no nearMisses to an error without the field', async () => {
    class BerthClosedError extends errorBase<
      'ACME_BERTH_CLOSED',
      { berth: string }
    >('ACME_BERTH_CLOSED', 'BerthClosedError', DOCKING_DOCS) {}
    const error = await checkedWith(
      () => new BerthClosedError({ berth: 'B7' }),
      nearBerth,
    );
    expect(error.message).toBe('[ACME_BERTH_CLOSED] no berth.');
    expect(Object.hasOwn(error, 'nearMisses')).toBe(false);
  });

  class BerthLockedError extends errorBase<
    'ACME_BERTH_LOCKED',
    { berth: string }
  >('ACME_BERTH_LOCKED', 'BerthLockedError', DOCKING_DOCS) {}

  it('formats an error whose nearMisses is hidden and keeps its list', async () => {
    const raised = new BerthLockedError(
      { berth: 'B7' },
      { hidden: { nearMisses: [] } },
    );
    const error = await checkedWith(() => raised, nearBerth);
    expect(error).toBe(raised);
    expect(error.message).toBe('[ACME_BERTH_LOCKED] no berth.');
    expect((error as unknown as { nearMisses: unknown }).nearMisses).toEqual(
      [],
    );
  });

  it('passes a frozen error through with its own line', async () => {
    const raised = Object.freeze(
      new BerthLockedError({ berth: 'B7', nearMisses: [] } as never),
    );
    const line = raised.message;
    const error = await checkedWith(() => raised, nearBerth);
    expect(error).toBe(raised);
    expect(error.message).toBe(line);
    expect((error as unknown as { nearMisses: unknown }).nearMisses).toEqual(
      [],
    );
  });

  it('passes a frozen BlueprintError a check reports through, inside the aggregate', async () => {
    const raised = Object.freeze(
      new BlueprintError([new BerthLockedError({ berth: 'B7' })]),
    );
    const error = await checkedWith(() => raised, nearBerth);
    expect(error).toBe(raised);
  });

  it('passes the failed compile its view, and a runtime error the current one', async () => {
    const views: (BlueprintView | undefined)[] = [];
    const plugins = [
      formatter('text', (_error, view) => {
        views.push(view);
        return undefined;
      }),
    ];
    await rejected(
      Nexus.create(defineModule({ name: 'Root', providers: [null as never] }), {
        plugins,
      }),
    );
    const ship = await Nexus.create(Root, { plugins });
    thrown(() => ship.get(NAV_CHARTS));
    // The inner error and the aggregate of the failed compile, then get().
    expect(views.map((view) => view?.complete)).toEqual([false, false, true]);
    expect(views[2]?.providers.map((p) => p.name)).toEqual([
      'ReactorCore',
      'REQUEST',
    ]);
  });

  it('passes a runtime error in create the compiled view', async () => {
    const views: (BlueprintView | undefined)[] = [];
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(NAV_CHARTS, {
              useFactory: () => {
                throw new Error('offline');
              },
            }),
          ],
        }),
        {
          plugins: [
            formatter('text', (error, view) => {
              views.push(view);
              return { message: error.code };
            }),
          ],
        },
      ),
    );
    expect(views).toHaveLength(1);
    expect(views[0]?.complete).toBe(true);
    expect(views[0]?.providers.map((p) => p.name)).toEqual([
      'NavCharts',
      'REQUEST',
    ]);
  });

  it('formats the errors of a scope, a lazy thunk and disposal', async () => {
    class Bridge {
      constructor(readonly core: () => ReactorCore) {}
    }
    const calls: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          ReactorCore,
          provide(Bridge, { deps: [lazy(ReactorCore)], lifetime: 'scoped' }),
        ],
      }),
      { plugins: [recording('text', calls)] },
    );
    const scope = await ship.createScope();
    const bridge = scope.get(Bridge);
    expect(thrown(() => scope.get(NAV_CHARTS))).toMatchObject({
      message: '[NEXUS_MISSING_PROVIDER] text: NEXUS_MISSING_PROVIDER',
    });
    await scope[Symbol.asyncDispose]();
    expect(thrown(() => scope.has(NAV_CHARTS))).toMatchObject({
      message: '[NEXUS_DISPOSED] text: NEXUS_DISPOSED',
    });
    await ship[Symbol.asyncDispose]();
    expect(thrown(() => bridge.core())).toMatchObject({
      message: '[NEXUS_DISPOSED] text: NEXUS_DISPOSED',
    });
    expect(await rejected(ship.createScope())).toMatchObject({
      message: '[NEXUS_DISPOSED] text: NEXUS_DISPOSED',
    });
    expect(calls).toEqual([
      'text NEXUS_MISSING_PROVIDER',
      'text NEXUS_DISPOSED',
      'text NEXUS_DISPOSED',
      'text NEXUS_DISPOSED',
    ]);
  });
});

describe('guardAsync', () => {
  it('returns the same promise for a second disposal call', async () => {
    const ship = await Nexus.create(Root, {
      plugins: [formatter('text', () => undefined)],
    });
    const first = ship[Symbol.asyncDispose]();
    expect(ship[Symbol.asyncDispose]()).toBe(first);
    await first;
  });
});

describe('fromUserCode', () => {
  class Missing {}
  const THROWER = new Token<string>('Thrower');

  /** B, a container with no plugin unless given one, and an error its get() raised. */
  async function containerB(plugins: readonly NexusPlugin[] = []) {
    const b = await Nexus.create(
      defineModule({ name: 'Bravo', providers: [ReactorCore] }),
      { plugins },
    );
    return b;
  }

  /** A, whose transient THROWER factory runs `body`. */
  function containerA(
    body: () => string,
    plugins: readonly NexusPlugin[],
  ): Promise<Nexus> {
    return Nexus.create(
      defineModule({
        name: 'Alpha',
        providers: [
          provide(THROWER, { useFactory: body, lifetime: 'transient' }),
        ],
      }),
      { plugins },
    );
  }

  it('leaves an error another container raised inside a factory', async () => {
    const calls: string[] = [];
    const b = await containerB();
    const a = await containerA(
      () => b.get(Missing) as never,
      [recording('alpha', calls)],
    );
    const error = thrown(() => a.get(THROWER)) as MissingProviderError;
    expect(error).toBeInstanceOf(MissingProviderError);
    expect(error.module).toBe('Bravo');
    expect(error.message).toBe(coreLine(error));
    expect(error.nearMisses).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("lets the other container's own formatter format it once, with its view", async () => {
    const calls: string[] = [];
    const views: (BlueprintView | undefined)[] = [];
    const b = await containerB([
      formatter('bravo', (error, view) => {
        calls.push(`bravo ${error.code}`);
        views.push(view);
        return { message: `bravo ${error.code}` };
      }),
    ]);
    const a = await containerA(
      () => b.get(Missing) as never,
      [recording('alpha', calls)],
    );
    const error = thrown(() => a.get(THROWER)) as Error;
    expect(error.message).toBe(
      '[NEXUS_MISSING_PROVIDER] bravo NEXUS_MISSING_PROVIDER',
    );
    expect(calls).toEqual(['bravo NEXUS_MISSING_PROVIDER']);
    expect(views[0]?.providers.map((p) => p.name)).toContain('ReactorCore');
  });

  it('leaves a NexusError a factory builds and throws itself', async () => {
    const calls: string[] = [];
    const a = await containerA(() => {
      throw new DisposedError({ target: 'container' });
    }, [recording('alpha', calls)]);
    const error = thrown(() => a.get(THROWER)) as NexusError;
    expect(error.message).toBe(
      '[NEXUS_DISPOSED] target=container. https://nexus.js.org/errors/NEXUS_DISPOSED',
    );
    expect(calls).toEqual([]);
  });

  it("still formats core's error on a dependency path and a ProviderError around a plain throw", async () => {
    const SCOPED = new Token<string>('Mission');
    class Drone {
      constructor(readonly mission: string) {}
    }
    const calls: string[] = [];
    const cause = new Error('offline');
    const a = await Nexus.create(
      defineModule({
        name: 'Alpha',
        providers: [
          provide(THROWER, {
            useFactory: (): string => {
              throw cause;
            },
            lifetime: 'transient',
          }),
          provide(Drone, { deps: [SCOPED], lifetime: 'transient' }),
          provide(SCOPED, {
            useFactory: () => 'x',
            lifetime: 'scoped',
          }),
        ],
      }),
      { plugins: [recording('alpha', calls)] },
    );
    expect(thrown(() => a.get(Drone))).toMatchObject({
      message: '[NEXUS_SCOPE_REQUIRED] alpha: NEXUS_SCOPE_REQUIRED',
    });
    const failed = thrown(() => a.get(THROWER)) as Error;
    expect(failed.message).toBe(
      '[NEXUS_PROVIDER_FAILED] alpha: NEXUS_PROVIDER_FAILED',
    );
    expect(failed.cause).toBe(cause);
    expect(cause.message).toBe('offline');
    expect(calls).toEqual([
      'alpha NEXUS_SCOPE_REQUIRED',
      'alpha NEXUS_PROVIDER_FAILED',
    ]);
  });

  it("formats a lazy thunk's error once, in the thunk's own call, when a constructor rethrows it", async () => {
    class Probe {
      constructor(readonly self: () => Probe) {
        self();
      }
    }
    const calls: string[] = [];
    const a = await Nexus.create(
      defineModule({
        name: 'Alpha',
        providers: [
          provide(Probe, { deps: [lazy(Probe)], lifetime: 'transient' }),
        ],
      }),
      { plugins: [recording('alpha', calls)] },
    );
    const error = thrown(() => a.get(Probe)) as Error;
    expect(error.message).toBe('[NEXUS_NOT_READY] alpha: NEXUS_NOT_READY');
    expect(calls).toEqual(['alpha NEXUS_NOT_READY']);
  });

  it('leaves an error a trace callback throws', async () => {
    const b = await containerB();
    const foreign = thrown(() => b.get(Missing)) as NexusError;
    const calls: string[] = [];
    const a = await Nexus.create(
      defineModule({
        name: 'Alpha',
        providers: [
          provide(THROWER, { useFactory: () => 'x', lifetime: 'transient' }),
        ],
      }),
      {
        plugins: [
          observer((event) => {
            if (event.type === 'construct') throw foreign;
          }),
          recording('alpha', calls),
        ],
      },
    );
    expect(thrown(() => a.get(THROWER))).toBe(foreign);
    expect(foreign.message).toBe(coreLine(foreign));
    expect(calls).toEqual([]);
  });

  it('leaves an error a disposer throws', async () => {
    const b = await containerB();
    const foreign = thrown(() => b.get(Missing)) as NexusError;
    class Hull {
      [Symbol.dispose](): void {
        throw foreign;
      }
    }
    const calls: string[] = [];
    const a = await Nexus.create(
      defineModule({ name: 'Alpha', providers: [Hull] }),
      { plugins: [recording('alpha', calls)] },
    );
    expect(await rejected(a[Symbol.asyncDispose]())).toBe(foreign);
    expect(foreign.message).toBe(coreLine(foreign));
    expect(calls).toEqual([]);
  });

  it("leaves an error a plugin's dispose hook throws", async () => {
    const b = await containerB();
    const foreign = thrown(() => b.get(Missing)) as NexusError;
    const calls: string[] = [];
    const a = await Nexus.create(Root, {
      plugins: [
        {
          ...recording('alpha', calls),
          dispose: () => {
            throw foreign;
          },
        },
      ],
    });
    expect(await rejected(a[Symbol.asyncDispose]())).toBe(foreign);
    expect(foreign.message).toBe(coreLine(foreign));
    expect(calls).toEqual([]);
  });

  it("formats the container's own error once when its factory calls the same container", async () => {
    const calls: string[] = [];
    const views: (BlueprintView | undefined)[] = [];
    const CHARTS = new Token<string>('Charts');
    // Tactical belongs to this container, so the view the hook receives
    // names it.
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(new Token<string>('Charts'), { useValue: 'x' })],
    });
    const holder: { a?: Nexus } = {};
    const a = await Nexus.create(
      defineModule({
        name: 'Alpha',
        imports: [Tactical],
        providers: [
          provide(THROWER, {
            useFactory: (): string => holder.a?.get(CHARTS) ?? '',
            lifetime: 'transient',
          }),
        ],
      }),
      {
        plugins: [
          formatter('alpha', (error, view) => {
            calls.push(error.code);
            views.push(view);
            return { message: `alpha ${error.code}` };
          }),
        ],
      },
    );
    holder.a = a;
    const error = thrown(() => a.get(THROWER)) as MissingProviderError;
    expect(error).toBeInstanceOf(MissingProviderError);
    expect(error.message).toBe(
      '[NEXUS_MISSING_PROVIDER] alpha NEXUS_MISSING_PROVIDER',
    );
    expect(error.nearMisses).toEqual([]);
    expect(calls).toEqual(['NEXUS_MISSING_PROVIDER']);
    expect(views).toHaveLength(1);
    expect(views[0]?.modules.map((m) => m.name)).toContain('Tactical');
  });
});
