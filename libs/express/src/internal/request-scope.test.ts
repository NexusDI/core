import { describe, expect, it, vi } from 'vitest';

import {
  BlueprintError,
  DisposedError,
  errorBase,
  MissingProviderError,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import {
  adapterCore,
  ContainerBuildError,
  containerOf,
  defaultLog,
  definitionCheck,
  disposer,
  enterFor,
  enterSection,
  mapError,
  requireHandle,
  resolveFor,
  existingScope,
  guardLog,
  logLevel,
  loader,
  logEach,
  NexusHttpError,
  once,
  requestScope,
  RequestFinishedError,
  statusOf,
  toHttpError,
  validateFailure,
  validateNow,
  validator,
  type LogContext,
} from './request-scope.js';

const MISSION = new Token<NexusRequest['mission']>('Mission');
const providers = [
  provide(MISSION, {
    useFactory: (request: NexusRequest) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
];
const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('containerOf', () => {
  it('returns the container it was given', async () => {
    await using ship = await Nexus.create(providers);
    expect(await containerOf(ship)()).toBe(ship);
  });

  it('builds once for ten concurrent first calls', async () => {
    await using ship = await Nexus.create(providers);
    const build = vi.fn(() => Promise.resolve(ship));
    const container = containerOf(build);
    const all = await Promise.all(
      Array.from({ length: 10 }, () => container()),
    );
    expect(build).toHaveBeenCalledTimes(1);
    expect(new Set(all)).toEqual(new Set([ship]));
  });

  it('rejects every waiter with ContainerBuildError and builds again on the next call', async () => {
    await using ship = await Nexus.create(providers);
    const cause = new Error('charts offline');
    const build = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(ship);
    const container = containerOf(build);
    const waiters = await Promise.allSettled(
      Array.from({ length: 10 }, () => container()),
    );
    for (const result of waiters) {
      expect(result.status).toBe('rejected');
      const reason = (result as PromiseRejectedResult)
        .reason as ContainerBuildError;
      expect(reason).toBeInstanceOf(ContainerBuildError);
      expect(reason.cause).toBe(cause);
      expect(statusOf(reason)).toBe(503);
    }
    expect(await container()).toBe(ship);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('turns a synchronous throw into a rejection', async () => {
    const container = containerOf(() => {
      throw new Error('no reactor');
    });
    await expect(container()).rejects.toBeInstanceOf(ContainerBuildError);
  });
});

describe('requestScope', () => {
  it('creates no scope and calls no mapping until scope() is called', async () => {
    await using ship = await Nexus.create(providers);
    const request = vi.fn(() => survey);
    const handle = requestScope(containerOf(ship), request);
    expect(handle.started).toBe(false);
    await handle.close();
    expect(request).not.toHaveBeenCalled();
  });

  it('shares one scope between concurrent first uses', async () => {
    await using ship = await Nexus.create(providers);
    const create = vi.spyOn(ship, 'createScope');
    const handle = requestScope(containerOf(ship), () => survey);
    const [a, b] = await Promise.all([handle.scope(), handle.scope()]);
    expect(handle.started).toBe(true);
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
    expect(a.get(MISSION)).toEqual(survey.mission);
    await handle.close();
  });

  it('disposes the scope once on close and rejects a later first use', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    const scope = await handle.scope();
    await handle.close();
    expect(() => scope.get(MISSION)).toThrow(DisposedError);
    const late = requestScope(containerOf(ship), () => survey);
    await late.close();
    await expect(late.scope()).rejects.toBeInstanceOf(RequestFinishedError);
  });

  it('waits for a scope still being created when close runs', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    const pending = handle.scope();
    await handle.close();
    const scope = await pending;
    expect(() => scope.get(MISSION)).toThrow(DisposedError);
  });
});

describe('existingScope', () => {
  it('returns the given scope and disposes nothing', async () => {
    await using ship = await Nexus.create(providers);
    await using scope = await ship.createScope({ request: survey });
    const handle = existingScope(scope);
    expect(handle.started).toBe(true);
    expect(await handle.scope()).toBe(scope);
    await handle.close();
    expect(scope.get(MISSION)).toEqual(survey.mission);
  });
});

describe('statusOf and toHttpError', () => {
  const ThirdParty = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
    'ACME_STARDOCK_OFFLINE',
    'StardockOfflineError',
  );

  it('maps a disposed container to 503, any other NexusError to 500, anything else to undefined', () => {
    expect(statusOf(new DisposedError({ target: 'container' }))).toBe(503);
    expect(statusOf(new ThirdParty({ dock: '7' }))).toBe(500);
    expect(statusOf(new Error('plain'))).toBeUndefined();
    expect(statusOf(new RequestFinishedError())).toBeUndefined();
  });

  it('logs once and returns an error with the status text and no code', () => {
    const log = vi.fn();
    const error = new ThirdParty({ dock: '7' });
    const http = toHttpError(error, log, '@nexusdi/test', 'scope');
    expect(http).toBeInstanceOf(NexusHttpError);
    expect(http.status).toBe(500);
    expect(http.statusCode).toBe(500);
    expect(http.expose).toBe(false);
    expect(http.message).toBe('Internal Server Error');
    expect(http.cause).toBe(error);
    expect('code' in http).toBe(false);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, {
      adapter: '@nexusdi/test',
      phase: 'scope',
      status: 500,
    } satisfies LogContext);
  });

  it('rethrows an error it does not map, without logging', () => {
    const log = vi.fn();
    const plain = new Error('handler bug');
    expect(() => toHttpError(plain, log, '@nexusdi/test', 'scope')).toThrow(
      plain,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('logs a failed build with phase build, whatever the phase it was given', () => {
    const log = vi.fn();
    const error = new ContainerBuildError({ cause: new Error('no reactor') });
    const http = toHttpError(error, log, '@nexusdi/test', 'scope');
    expect(http.status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, {
      adapter: '@nexusdi/test',
      phase: 'build',
      status: 503,
    } satisfies LogContext);
  });

  it('says Service Unavailable for 503', () => {
    expect(new NexusHttpError(503, { cause: undefined }).message).toBe(
      'Service Unavailable',
    );
  });
});

describe('defaultLog and logEach', () => {
  it('writes the code, the fields and the message of a NexusError', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new MissingProviderError({
      token: 'NavCharts',
      module: 'root',
      path: [],
    } as never);
    defaultLog(error, { adapter: '@nexusdi/test', phase: 'validate' });
    expect(write).toHaveBeenCalledWith(
      '[@nexusdi/test] validate:',
      'NEXUS_MISSING_PROVIDER',
      expect.objectContaining({ token: 'NavCharts' }),
      error.message,
    );
    write.mockRestore();
  });

  it('writes the phase and the error for anything else', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('disposer failed');
    defaultLog(error, { adapter: '@nexusdi/test', phase: 'dispose' });
    expect(write).toHaveBeenCalledWith('[@nexusdi/test] dispose:', error);
    write.mockRestore();
  });

  it('gives a disposed container warn and every other mapped error error', () => {
    const at = { adapter: '@nexusdi/test', phase: 'scope' } as const;
    expect(
      logLevel(new DisposedError({ target: 'container' }), {
        ...at,
        status: 503,
      }),
    ).toBe('warn');
    expect(
      logLevel(new ContainerBuildError({ cause: new Error('no reactor') }), {
        ...at,
        phase: 'build',
        status: 503,
      }),
    ).toBe('error');
    expect(logLevel(new Error('disposer failed'), at)).toBe('error');
  });

  it('warns for a disposed container and errors for a failed build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const disposed = new DisposedError({ target: 'container' });
    const build = new ContainerBuildError({ cause: new Error('no reactor') });
    defaultLog(disposed, {
      adapter: '@nexusdi/test',
      phase: 'scope',
      status: 503,
    });
    defaultLog(build, {
      adapter: '@nexusdi/test',
      phase: 'build',
      status: 503,
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[@nexusdi/test] scope:',
      'NEXUS_DISPOSED',
      expect.any(Object),
      disposed.message,
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(
      '[@nexusdi/test] build:',
      build,
    );
    warn.mockRestore();
    write.mockRestore();
  });

  it('logs each inner error of a BlueprintError', () => {
    const log = vi.fn();
    const inner = [
      new MissingProviderError({
        token: 'NavCharts',
        module: 'root',
        path: [],
      } as never),
      new MissingProviderError({
        token: 'FlightLog',
        module: 'root',
        path: [],
      } as never),
    ];
    logEach(new BlueprintError(inner), log, '@nexusdi/test', 'validate');
    expect(log.mock.calls.map(([error]) => error)).toEqual(inner);
  });
});

describe('guardLog', () => {
  it('passes each call through to the log', () => {
    const log = vi.fn();
    const error = new Error('disposer failed');
    const context = { adapter: '@nexusdi/test', phase: 'dispose' } as const;
    guardLog(log)(error, context);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, context);
  });

  it("writes the original error and the log's error when the log throws", () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('log sink offline');
    const error = new Error('disposer failed');
    const guarded = guardLog(() => {
      throw failure;
    });
    expect(() =>
      guarded(error, { adapter: '@nexusdi/test', phase: 'dispose' }),
    ).not.toThrow();
    expect(write).toHaveBeenCalledExactlyOnceWith(
      '[@nexusdi/test] log threw:',
      failure,
      error,
    );
    write.mockRestore();
  });

  it("writes the original error and the log's error when an async log rejects", async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('log sink offline');
    const error = new Error('disposer failed');
    const guarded = guardLog(() => Promise.reject(failure) as never);
    guarded(error, { adapter: '@nexusdi/test', phase: 'dispose' });
    await vi.waitFor(() =>
      expect(write).toHaveBeenCalledExactlyOnceWith(
        '[@nexusdi/test] log threw:',
        failure,
        error,
      ),
    );
    write.mockRestore();
  });
});

describe('validateFailure', () => {
  const missing = (token: string) =>
    new MissingProviderError({ token, module: 'root', path: [] } as never);

  it('logs each inner error once with phase validate and returns a 500', () => {
    const log = vi.fn();
    const inner = [missing('NavCharts'), missing('FlightLog')];
    const blueprint = new BlueprintError(inner);
    const http = validateFailure(blueprint, log, '@nexusdi/test');
    expect(http).toBeInstanceOf(NexusHttpError);
    expect((http as NexusHttpError).status).toBe(500);
    expect((http as NexusHttpError).cause).toBe(blueprint);
    expect(log.mock.calls).toEqual([
      [inner[0], { adapter: '@nexusdi/test', phase: 'validate' }],
      [inner[1], { adapter: '@nexusdi/test', phase: 'validate' }],
    ]);
  });

  it('maps a failed build to 503 with phase build', () => {
    const log = vi.fn();
    const error = new ContainerBuildError({ cause: new Error('no reactor') });
    const http = validateFailure(error, log, '@nexusdi/test');
    expect((http as NexusHttpError).status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, {
      adapter: '@nexusdi/test',
      phase: 'build',
      status: 503,
    });
  });

  it('maps a disposed container to 503 with phase validate', () => {
    const log = vi.fn();
    const error = new DisposedError({ target: 'container' });
    const http = validateFailure(error, log, '@nexusdi/test');
    expect((http as NexusHttpError).status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, {
      adapter: '@nexusdi/test',
      phase: 'validate',
      status: 503,
    });
  });

  it('returns an error it does not map unchanged, without logging', () => {
    const log = vi.fn();
    const plain = new Error('handler bug');
    expect(validateFailure(plain, log, '@nexusdi/test')).toBe(plain);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('validateNow', () => {
  it('passes for deps the container provides', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    validateNow(ship, { mission: MISSION }, log, '@nexusdi/test');
    expect(log).not.toHaveBeenCalled();
  });

  it('logs each missing entry once with phase validate and rethrows', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    const absent = new Token<string>('Absent');
    const other = new Token<string>('Other');
    expect(() =>
      validateNow(ship, { absent, other }, log, '@nexusdi/test'),
    ).toThrow(BlueprintError);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.map(([, context]) => context)).toEqual([
      { adapter: '@nexusdi/test', phase: 'validate' },
      { adapter: '@nexusdi/test', phase: 'validate' },
    ]);
  });

  it('does nothing for a function source', () => {
    const build = vi.fn(() => Promise.reject(new Error('never called')));
    validateNow(
      build,
      { absent: new Token<string>('Absent') },
      vi.fn(),
      '@nexusdi/test',
    );
    expect(build).not.toHaveBeenCalled();
  });
});

describe('once, loader and validator', () => {
  it('calls once at most once', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const run = once(fn);
    await Promise.all([run(), run(), run()]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('loads a module once per container and forgets a failed load', async () => {
    await using ship = await Nexus.create(providers);
    const load = vi
      .spyOn(ship, 'load')
      .mockRejectedValueOnce(new Error('section offline'))
      .mockResolvedValue(undefined);
    const section = { name: 'Navigation' } as never;
    const loadOf = loader(containerOf(ship));
    await expect(loadOf(section)).rejects.toThrow('section offline');
    expect(await loadOf(section)).toBe(ship);
    expect(await loadOf(section)).toBe(ship);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('validates once per container and keeps a failure', async () => {
    await using ship = await Nexus.create(providers);
    const missing = new Token<string>('Absent');
    const check = validator(containerOf(ship), { absent: missing });
    const validate = vi.spyOn(ship, 'validate');
    await expect(check()).rejects.toBeInstanceOf(BlueprintError);
    await expect(check()).rejects.toBeInstanceOf(BlueprintError);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});

describe('disposer, enterSection and definitionCheck', () => {
  it('closes the handle once and logs a disposal error with phase dispose', async () => {
    const failure = new Error('hatch jammed');
    const close = vi.fn(() => Promise.reject(failure));
    const log = vi.fn();
    const dispose = disposer(
      { scope: vi.fn(), started: true, close },
      log,
      '@nexusdi/test',
    );
    await Promise.all([dispose(), dispose()]);
    expect(close).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(failure, {
      adapter: '@nexusdi/test',
      phase: 'dispose',
    });
  });

  it('loads the module and extends a started scope only', async () => {
    await using ship = await Nexus.create(providers);
    const load = vi.fn(() => Promise.resolve(ship));
    const section = { name: 'Navigation' } as never;
    await enterSection(load, section, null);
    const idle = requestScope(containerOf(ship), () => survey);
    await enterSection(load, section, idle);
    expect(idle.started).toBe(false);
    const busy = requestScope(containerOf(ship), () => survey);
    const scope = await busy.scope();
    const extend = vi.spyOn(scope, 'extend');
    await enterSection(load, section, busy);
    expect(extend).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(3);
    await busy.close();
  });

  it('validates a live container at once and a function source on first use', async () => {
    await using ship = await Nexus.create(providers);
    const absent = new Token<string>('Absent');
    expect(() =>
      definitionCheck(
        ship,
        containerOf(ship),
        { absent },
        vi.fn(),
        '@nexusdi/test',
      ),
    ).toThrow(BlueprintError);
    const live = definitionCheck(
      ship,
      containerOf(ship),
      { mission: MISSION },
      vi.fn(),
      '@nexusdi/test',
    );
    await expect(live()).resolves.toBeUndefined();
    const build = () => Promise.resolve(ship);
    const lazy = definitionCheck(
      build,
      containerOf(build),
      { absent },
      vi.fn(),
      '@nexusdi/test',
    );
    await expect(lazy()).rejects.toBeInstanceOf(BlueprintError);
  });
});

describe('requireHandle, mapError, enterFor and resolveFor', () => {
  const absent = new Token<string>('Absent');

  it('names the hook to register when a request has no handle', () => {
    expect(() =>
      requireHandle(undefined, '@nexusdi/test', 'di.middleware'),
    ).toThrow(
      '[@nexusdi/test] no scope on this request: register di.middleware before this route',
    );
    const handle = existingScope({} as never);
    expect(requireHandle(handle, '@nexusdi/test', 'di.middleware')).toBe(
      handle,
    );
  });

  it('maps a NexusError and passes anything else through', () => {
    const log = vi.fn();
    const plain = new Error('handler bug');
    expect(mapError(plain, log, '@nexusdi/test', 'scope')).toBe(plain);
    const http = mapError(
      new DisposedError({ target: 'container' }),
      log,
      '@nexusdi/test',
      'scope',
    );
    expect((http as NexusHttpError).status).toBe(503);
    expect(log).toHaveBeenCalledOnce();
  });

  it('resolves the deps from the request scope', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    const result = await resolveFor({
      handle: () => handle,
      deps: { mission: MISSION },
      checked: () => Promise.resolve(),
      load: loader(containerOf(ship)),
      log: vi.fn(),
      adapter: '@nexusdi/test',
    });
    expect(result).toEqual({ deps: { mission: survey.mission } });
    await handle.close();
  });

  it('reports a closed request as finished and logs it once', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    await handle.close();
    const log = vi.fn();
    const result = await resolveFor({
      handle: () => handle,
      deps: { mission: MISSION },
      checked: () => Promise.resolve(),
      load: loader(containerOf(ship)),
      log,
      adapter: '@nexusdi/test',
    });
    expect(result).toEqual({ finished: true });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.any(RequestFinishedError),
      { adapter: '@nexusdi/test', phase: 'scope' },
    );
  });

  it('turns a validate failure into the 500, logged once per entry', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    const result = await resolveFor({
      handle: () => existingScope({} as never),
      deps: { absent },
      checked: validator(containerOf(ship), { absent }),
      load: loader(containerOf(ship)),
      log,
      adapter: '@nexusdi/test',
    });
    expect((result as { failure: NexusHttpError }).failure.status).toBe(500);
    expect(log).toHaveBeenCalledOnce();
  });

  it('passes a plain error from the handle lookup through unmapped', async () => {
    await using ship = await Nexus.create(providers);
    const missing = new Error('register di.middleware');
    const result = await resolveFor({
      handle: () => {
        throw missing;
      },
      deps: {},
      checked: () => Promise.resolve(),
      load: loader(containerOf(ship)),
      log: vi.fn(),
      adapter: '@nexusdi/test',
    });
    expect(result).toEqual({ failure: missing });
  });

  it('loads a section before it resolves, and reports a failed load as a load failure', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    const failing = vi.fn(() =>
      Promise.reject(new DisposedError({ target: 'container' })),
    );
    const result = await enterFor({
      load: failing,
      section: { name: 'Navigation' } as never,
      handle: null,
      log,
      adapter: '@nexusdi/test',
    });
    expect((result as { failure: NexusHttpError }).failure.status).toBe(503);
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/test',
      phase: 'load',
      status: 503,
    });
    expect(
      await enterFor({
        load: () => Promise.resolve(ship),
        section: { name: 'Navigation' } as never,
        handle: null,
        log,
        adapter: '@nexusdi/test',
      }),
    ).toBeUndefined();
  });
});

describe('adapterCore', () => {
  it('opens a lazy handle whose dispose step runs once', async () => {
    await using ship = await Nexus.create(providers);
    const core = adapterCore(ship, {}, '@nexusdi/test');
    const { handle, dispose } = core.open(() => survey);
    expect(handle.started).toBe(false);
    const scope = await handle.scope();
    await Promise.all([dispose(), dispose()]);
    expect(() => scope.get(MISSION)).toThrow(DisposedError);
  });

  it('starts an ambient scope, or disposes and maps the failure', async () => {
    const ship = await Nexus.create(providers);
    const log = vi.fn();
    const core = adapterCore(ship, { log }, '@nexusdi/test');
    const { handle, dispose } = core.open(() => survey);
    const started = await core.ambient(handle, dispose);
    expect('scope' in started && started.scope.get(MISSION)).toEqual(
      survey.mission,
    );
    await dispose();
    await ship[Symbol.asyncDispose]();
    const late = core.open(() => survey);
    const failed = await core.ambient(late.handle, late.dispose);
    expect((failed as { failure: NexusHttpError }).failure.status).toBe(503);
    expect(log).toHaveBeenCalledOnce();
  });

  it('resolves deps through the bound request path', async () => {
    await using ship = await Nexus.create(providers);
    const core = adapterCore(ship, {}, '@nexusdi/test');
    const { handle, dispose } = core.open(() => survey);
    const deps = { mission: MISSION };
    expect(
      await core.resolve({
        handle: () => handle,
        deps,
        checked: core.definition(deps),
      }),
    ).toEqual({ deps: { mission: survey.mission } });
    expect(await core.enter({ name: 'Navigation' } as never, handle)).toEqual({
      failure: expect.anything(),
    });
    await dispose();
  });
});
