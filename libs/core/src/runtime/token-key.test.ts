import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import type {
  BlueprintView,
  CompileContext,
  ProviderView,
} from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { all, lazy, optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin, PluginContext } from './plugins.js';

/** Two copies of a contracts package make two Token objects per name. */
const shellAuth = new Token<string>('bank/Auth');
const remoteAuth = new Token<string>('bank/Auth');
const byDescription = {
  name: 'keys',
  apiVersion: 1,
  tokenKey: (token: unknown) =>
    token instanceof Token ? `key:${token.description}` : undefined,
};

describe('tokenKey', () => {
  it('binds two tokens with one key to one provider', async () => {
    class Remote {
      static deps = [remoteAuth] as const;
      constructor(readonly auth: string) {}
    }
    const Shell = defineModule({
      name: 'Shell',
      providers: [provide(shellAuth, { useValue: 'shell-auth' }), Remote],
      exports: [Remote],
    });
    const ship = await Nexus.create(Shell, { plugins: [byDescription] });
    expect(ship.get(Remote).auth).toBe('shell-auth');
    expect(ship.get(remoteAuth)).toBe('shell-auth');
  });

  it('reports two providers of one key in one module as duplicates', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          providers: [
            provide(shellAuth, { useValue: 'a' }),
            provide(remoteAuth, { useValue: 'b' }),
          ],
        }),
        { plugins: [byDescription] },
      ),
    );
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_DUPLICATE_PROVIDER', token: 'bank/Auth' }],
    });
  });

  it('keeps identity without a tokenKey plugin', async () => {
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [
          provide(shellAuth, { useValue: 'a' }),
          provide(remoteAuth, { useValue: 'b' }),
        ],
      }),
    );
    expect(ship.get(shellAuth)).toBe('a');
    expect(ship.get(remoteAuth)).toBe('b');
  });

  it('gives each edge the token the dependent named', async () => {
    let tokens: unknown[] = [];
    class Remote {
      static deps = [remoteAuth] as const;
      constructor(readonly auth: string) {}
    }
    await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [provide(shellAuth, { useValue: 'x' }), Remote],
      }),
      {
        plugins: [
          {
            ...byDescription,
            compile: {
              check: (view) => void (tokens = view.edges.map((e) => e.written)),
            },
          },
        ],
      },
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toBe(remoteAuth);
  });

  it('gives an alias edge the target the alias named', async () => {
    const ALIAS = new Token<string>('Alias');
    let tokens: unknown[] = [];
    await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [
          provide(shellAuth, { useValue: 'x' }),
          provide(ALIAS, { useExisting: remoteAuth }),
        ],
      }),
      {
        plugins: [
          {
            ...byDescription,
            compile: {
              check: (view) => void (tokens = view.edges.map((e) => e.written)),
            },
          },
        ],
      },
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toBe(remoteAuth);
  });

  describe('BlueprintView.visible()', () => {
    const Shell = defineModule({
      name: 'Shell',
      providers: [provide(shellAuth, { useValue: 'shell-auth' })],
    });
    const boundTo = (view: BlueprintView): readonly string[] =>
      view.providers.filter((p) => p.token === shellAuth).map((p) => p.id);

    it('keys its token in a compile.check view', async () => {
      const seen: (readonly string[])[] = [];
      await Nexus.create(Shell, {
        plugins: [
          {
            ...byDescription,
            compile: {
              check: (view) => {
                seen.push(view.visible(view.root, remoteAuth), boundTo(view));
              },
            },
          },
        ],
      });
      expect(seen[0]).toHaveLength(1);
      expect(seen[0]).toEqual(seen[1]);
    });

    it('keys its token in the view setup reads', async () => {
      const seen: (readonly string[])[] = [];
      await Nexus.create(Shell, {
        plugins: [
          {
            ...byDescription,
            setup: (context) => {
              const view = context.blueprint();
              seen.push(view.visible(view.root, remoteAuth), boundTo(view));
            },
          },
        ],
      });
      expect(seen[0]).toHaveLength(1);
      expect(seen[0]).toEqual(seen[1]);
    });

    it('keys its token in a Nexus.check view', () => {
      const seen: (readonly string[])[] = [];
      Nexus.check(Shell, {
        plugins: [
          {
            ...byDescription,
            compile: {
              check: (view) => {
                seen.push(view.visible(view.root, remoteAuth), boundTo(view));
              },
            },
          },
        ],
      });
      expect(seen[0]).toHaveLength(1);
      expect(seen[0]).toEqual(seen[1]);
    });
  });

  describe('canonical()', () => {
    const Shell = defineModule({
      name: 'Shell',
      providers: [provide(shellAuth, { useValue: 'shell-auth' })],
    });
    const breaksOn = (token: unknown, cause: Error) => ({
      name: 'broken',
      apiVersion: 1,
      tokenKey: (seen: unknown) => {
        if (seen === token) throw cause;
        return byDescription.tokenKey(seen);
      },
    });

    it('gives a compile.provider hook the canonical token the provider holds', async () => {
      const seen: unknown[] = [];
      await Nexus.create(Shell, {
        plugins: [
          {
            ...byDescription,
            compile: {
              provider: (provider, context) =>
                void seen.push(provider.token, context.canonical(remoteAuth)),
            },
          },
        ],
      });
      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(shellAuth);
      expect(seen[1]).toBe(shellAuth);
    });

    it('returns the token itself without a tokenKey plugin', async () => {
      const seen: unknown[] = [];
      await Nexus.create(Shell, {
        plugins: [
          {
            name: 'probe',
            apiVersion: 1,
            compile: {
              provider: (_, context) =>
                void seen.push(context.canonical(remoteAuth)),
              check: (view) => void seen.push(view.canonical(remoteAuth)),
            },
          },
        ],
      });
      expect(seen).toHaveLength(2);
      for (const token of seen) expect(token).toBe(remoteAuth);
    });

    it('keys its token in a compile.check view, a setup view and a Nexus.check view', async () => {
      const seen: unknown[] = [];
      const plugin = {
        ...byDescription,
        compile: {
          check: (view: BlueprintView) =>
            void seen.push(view.canonical(remoteAuth)),
        },
        setup: (context: PluginContext) =>
          void seen.push(context.blueprint().canonical(remoteAuth)),
      };
      await Nexus.create(Shell, { plugins: [plugin] });
      Nexus.check(Shell, { plugins: [plugin] });
      expect(seen).toHaveLength(3);
      for (const token of seen) expect(token).toBe(shellAuth);
    });

    it('keys REQUEST to itself', async () => {
      const seen: unknown[] = [];
      await Nexus.create(Shell, {
        plugins: [
          {
            ...byDescription,
            compile: {
              provider: (_, context) =>
                void seen.push(context.canonical(REQUEST)),
            },
          },
        ],
      });
      expect(seen).toEqual([REQUEST]);
      expect(seen[0]).toBe(REQUEST);
    });

    it('fails the calling compile.provider hook when tokenKey throws', async () => {
      const cause = new Error('no key');
      const error = await rejected(
        Nexus.create(Shell, {
          plugins: [
            breaksOn(remoteAuth, cause),
            {
              name: 'p',
              apiVersion: 1,
              compile: {
                provider: (_, context) => void context.canonical(remoteAuth),
              },
            },
          ],
        }),
      );
      expect(error).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_PLUGIN_FAILED',
            plugin: 'p',
            hook: 'compile.provider',
            cause: { code: 'NEXUS_PLUGIN_FAILED', hook: 'tokenKey', cause },
          },
        ],
      });
    });

    it('fails the calling compile.check hook when tokenKey throws', async () => {
      const cause = new Error('no key');
      const error = await rejected(
        Nexus.create(Shell, {
          plugins: [
            breaksOn(remoteAuth, cause),
            {
              name: 'p',
              apiVersion: 1,
              compile: { check: (view) => void view.canonical(remoteAuth) },
            },
          ],
        }),
      );
      expect(error).toMatchObject({
        errors: [
          {
            code: 'NEXUS_PLUGIN_FAILED',
            plugin: 'p',
            hook: 'compile.check',
            cause: { code: 'NEXUS_PLUGIN_FAILED', hook: 'tokenKey', cause },
          },
        ],
      });
    });

    it('adds no error to a failed compile when formatError calls it on a throwing tokenKey', async () => {
      const MISSING = new Token<string>('Missing');
      const views: (BlueprintView | undefined)[] = [];
      const error = await rejected(
        Nexus.create(
          defineModule({
            name: 'Shell',
            providers: [
              provide(new Token<string>('Needs'), {
                useFactory: (value: string) => value,
                deps: [MISSING],
              }),
            ],
          }),
          {
            plugins: [
              {
                ...breaksOn(remoteAuth, new Error('no key')),
                formatError: (_, view) => {
                  views.push(view);
                  view?.canonical(remoteAuth);
                  return undefined;
                },
              },
            ],
          },
        ),
      );
      expect(views.length).toBeGreaterThan(0);
      for (const view of views) expect(view).toBeDefined();
      expect(error).toMatchObject({
        errors: [{ code: 'NEXUS_MISSING_PROVIDER' }],
      });
      expect((error as { errors: unknown[] }).errors).toHaveLength(1);
    });

    it('keeps working on a context kept after the compile', async () => {
      let kept: CompileContext | undefined;
      await Nexus.create(Shell, {
        plugins: [
          {
            ...byDescription,
            compile: { provider: (_, context) => void (kept = context) },
          },
        ],
      });
      expect(kept?.canonical(remoteAuth)).toBe(shellAuth);
    });

    it('makes a token it meets first the canonical token of its key', async () => {
      let context: PluginContext | undefined;
      const ship = await Nexus.create(defineModule({ name: 'Shell' }), {
        plugins: [
          {
            ...byDescription,
            setup: (given: PluginContext) => {
              context = given;
              expect(given.blueprint().canonical(remoteAuth)).toBe(remoteAuth);
            },
          },
        ],
      });
      await ship.load(
        defineModule({
          name: 'Remote',
          providers: [provide(shellAuth, { useValue: 'remote-auth' })],
          exports: [shellAuth],
        }),
      );
      expect(ship.get(shellAuth)).toBe('remote-auth');
      const loaded = context
        ?.blueprint()
        .providers.filter((p) => p.name === 'bank/Auth');
      expect(loaded).toHaveLength(1);
      expect(loaded?.[0]?.token).toBe(remoteAuth);
      expect(loaded?.[0]?.written).toBe(shellAuth);
    });
  });

  describe('written', () => {
    interface IAuth {
      user(): string;
    }
    interface IAudit {
      record(): string;
    }
    const copyA = new Token<IAuth>('bank/Auth');
    const copyB = new Token<IAuth>('bank/Auth');
    const copyC = new Token<IAuth>('bank/Auth');
    const auditA = new MultiToken<IAudit>('bank/Audit');
    const auditB = new MultiToken<IAudit>('bank/Audit');
    const ada: IAuth = { user: () => 'ada' };
    class Auth implements IAuth {
      user(): string {
        return 'auth';
      }
    }
    /** Keys a Token and a MultiToken by description. */
    const keyed = {
      name: 'keys',
      apiVersion: 1,
      tokenKey: (token: unknown) =>
        token instanceof Token || token instanceof MultiToken
          ? `key:${token.description}`
          : undefined,
    };
    class Teller {
      static deps = [copyA] as const;
      constructor(readonly auth: IAuth) {}
    }
    const Remote = defineModule({
      name: 'Remote',
      providers: [Teller],
      exports: [Teller],
    });
    const Shell = defineModule({
      name: 'Shell',
      providers: [provide(copyB, { useValue: ada })],
      exports: [copyB],
      global: true,
    });
    /** The view a compile.check hook receives from Nexus.check. */
    const checkView = (
      root: unknown,
      plugin: NexusPlugin = keyed,
    ): BlueprintView => {
      let seen: BlueprintView | undefined;
      const check = (view: BlueprintView): void => void (seen = view);
      Nexus.check(root as never, {
        plugins: [{ ...plugin, compile: { ...plugin.compile, check } }],
      });
      if (seen === undefined) throw new Error('compile.check never ran');
      return seen;
    };
    const named = (view: BlueprintView, name: string): ProviderView[] =>
      view.providers.filter((p) => p.name === name);

    it('holds the token the module listed while token holds the copy met first', () => {
      const [first] = named(
        checkView(defineModule({ name: 'Root', imports: [Remote, Shell] })),
        'bank/Auth',
      );
      expect(first?.token).toBe(copyA);
      expect(first?.written).toBe(copyB);
      const [second] = named(
        checkView(defineModule({ name: 'Root', imports: [Shell, Remote] })),
        'bank/Auth',
      );
      expect(second?.token).toBe(copyB);
      expect(second?.written).toBe(copyB);
    });

    it('equals token for every provider and names the dependent token on every edge without a tokenKey plugin', () => {
      const MISSION = new Token<unknown>('Mission');
      const view = checkView(
        defineModule({
          name: 'Root',
          imports: [Shell],
          providers: [
            Teller,
            provide(copyA, { useValue: ada }),
            provide(MISSION, {
              useFactory: (request: unknown) => request,
              deps: [REQUEST],
              lifetime: 'scoped',
            }),
          ],
        }),
        { name: 'probe', apiVersion: 1 },
      );
      expect(view.providers.map((p) => p.token)).toContain(REQUEST);
      for (const provider of view.providers)
        expect(provider.written).toBe(provider.token);
      const written = view.edges.map((e) => e.written);
      expect(written).toHaveLength(2);
      expect(written[0]).toBe(copyA);
      expect(written[1]).toBe(REQUEST);
    });

    it('keeps the listed token through a compile.provider rewrite', () => {
      const view = checkView(defineModule({ name: 'Root', imports: [Shell] }), {
        ...keyed,
        name: 'fake',
        compile: {
          provider: (provider: ProviderView) =>
            provider.written === copyB
              ? { with: provide(copyC, { useValue: ada }) }
              : undefined,
        },
      });
      const [auth] = named(view, 'bank/Auth');
      expect(auth?.written).toBe(copyB);
      expect(auth?.rewrittenBy).toBe('fake');
    });

    it('holds each contributor its own copy of a MultiToken key', () => {
      const Audits = defineModule({
        name: 'Audits',
        providers: [provide(auditB, { useValue: { record: () => 'b' } })],
        exports: [auditB],
      });
      const view = checkView(
        defineModule({
          name: 'Root',
          imports: [Audits],
          providers: [provide(auditA, { useValue: { record: () => 'a' } })],
        }),
      );
      const audits = named(view, 'bank/Audit');
      expect(audits).toHaveLength(2);
      expect(audits.map((p) => p.written)).toContain(auditA);
      expect(audits.map((p) => p.written)).toContain(auditB);
      const [one, two] = audits;
      expect(one?.token).toBe(two?.token);
    });

    it('holds the loaded copy on a provider load() adds', async () => {
      class Probe {
        static deps = [optional(copyA)] as const;
        constructor(readonly auth: IAuth | undefined) {}
      }
      let context: PluginContext | undefined;
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [Probe] }),
        { plugins: [{ ...keyed, setup: (given) => void (context = given) }] },
      );
      await ship.load(
        defineModule({
          name: 'Remote',
          providers: [provide(copyC, { useValue: ada })],
          exports: [copyC],
        }),
      );
      if (context === undefined) throw new Error('setup never ran');
      const [loaded] = named(context.blueprint(), 'bank/Auth');
      expect(loaded?.token).toBe(copyA);
      expect(loaded?.written).toBe(copyC);
    });

    it('gives a construct hook the listed token', async () => {
      const seen: unknown[] = [];
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [Teller, provide(copyB, { useClass: Auth })],
        }),
        {
          plugins: [
            {
              ...keyed,
              construct: (instance, provider) => {
                if (provider.name === 'bank/Auth')
                  seen.push(provider.token, provider.written);
                return instance;
              },
            },
          ],
        },
      );
      ship.get(Teller);
      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(copyA);
      expect(seen[1]).toBe(copyB);
    });

    it('keys every edge written token to the token of its provider', () => {
      const ALIAS = new Token<IAuth>('Alias');
      const DESK = new Token<unknown[]>('Desk');
      const view = checkView(
        defineModule({
          name: 'Root',
          providers: [
            provide(DESK, {
              useFactory: (...args: unknown[]) => args,
              deps: [copyA, optional(copyA), lazy(copyA), all(auditA)],
            } as never),
            provide(copyB, { useValue: ada }),
            provide(auditB, { useValue: { record: () => 'b' } }),
            provide(ALIAS, { useExisting: copyC }),
          ],
        }),
      );
      const byId = new Map(view.providers.map((p) => [p.id, p]));
      expect(new Set(view.edges.map((e) => e.kind))).toEqual(
        new Set(['required', 'optional', 'lazy', 'all', 'alias']),
      );
      for (const edge of view.edges)
        expect(view.canonical(edge.written)).toBe(byId.get(edge.to)?.token);
      expect(view.edges.map((e) => e.written)).toContain(copyC);
    });

    it('gives a compile.provider hook the listed token beside the canonical one', async () => {
      const seen: unknown[] = [];
      await Nexus.create(
        defineModule({ name: 'Root', imports: [Remote, Shell] }),
        {
          plugins: [
            {
              ...keyed,
              compile: {
                provider: (provider) => {
                  if (provider.name === 'bank/Auth')
                    seen.push(provider.token, provider.written);
                  return undefined;
                },
              },
            },
          ],
        },
      );
      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(copyA);
      expect(seen[1]).toBe(copyB);
    });
  });

  it('keys has(), resolve(), validate() and a scope as get() does', async () => {
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [provide(shellAuth, { useValue: 'shell-auth' })],
      }),
      { plugins: [byDescription] },
    );
    expect(ship.has(remoteAuth)).toBe(true);
    expect(ship.resolve({ auth: remoteAuth })).toEqual({ auth: 'shell-auth' });
    expect(ship.validate([remoteAuth])).toBeUndefined();
    await using scope = await ship.createScope();
    expect(scope.get(remoteAuth)).toBe('shell-auth');
    expect(scope.has(remoteAuth)).toBe(true);
  });

  it('keys a Nexus.check root the way create does', () => {
    class Remote {
      static deps = [remoteAuth] as const;
      constructor(readonly auth: string) {}
    }
    expect(
      Nexus.check(
        defineModule({
          name: 'Shell',
          providers: [provide(shellAuth, { useValue: 'x' }), Remote],
        }),
        { plugins: [byDescription] },
      ),
    ).toBeUndefined();
  });

  it('keys a loaded module the way create keyed the root', async () => {
    const ship = await Nexus.create(defineModule({ name: 'Shell' }), {
      plugins: [byDescription],
    });
    expect(ship.has(shellAuth)).toBe(false);
    await ship.load(
      defineModule({
        name: 'Remote',
        providers: [provide(remoteAuth, { useValue: 'remote-auth' })],
        exports: [remoteAuth],
      }),
    );
    expect(ship.get(shellAuth)).toBe('remote-auth');
  });

  it('keys the deps of a compile.provider replacement', async () => {
    const TELLER = new Token<string>('Teller');
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [
          provide(shellAuth, { useValue: 'shell-auth' }),
          provide(TELLER, { useValue: 'none' }),
        ],
      }),
      {
        plugins: [
          {
            ...byDescription,
            compile: {
              provider: (provider) =>
                provider.token === TELLER
                  ? {
                      with: provide(TELLER, {
                        useFactory: (auth: string) => `teller:${auth}`,
                        deps: [remoteAuth],
                      }),
                    }
                  : undefined,
            },
          },
        ],
      },
    );
    expect(ship.get(TELLER)).toBe('teller:shell-auth');
  });

  it('keys REQUEST to itself', async () => {
    const MISSION = new Token<unknown>('Mission');
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [
          provide(MISSION, {
            useFactory: (request: unknown) => request,
            deps: [REQUEST],
            lifetime: 'scoped',
          }),
        ],
      }),
      {
        plugins: [{ name: 'all', apiVersion: 1, tokenKey: () => 'one key' }],
      },
    );
    const request = { mission: 'survey' };
    await using scope = await ship.createScope({ request });
    expect(scope.get(MISSION)).toBe(request);
  });

  it('asks the first plugin that returns a key', async () => {
    const calls: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [provide(shellAuth, { useValue: 'shell-auth' })],
      }),
      {
        plugins: [
          {
            name: 'none',
            apiVersion: 1,
            tokenKey: () => void calls.push('none'),
          },
          byDescription,
          {
            name: 'later',
            apiVersion: 1,
            tokenKey: () => {
              calls.push('later');
              return 'other';
            },
          },
        ],
      },
    );
    expect(ship.get(remoteAuth)).toBe('shell-auth');
    expect(calls).not.toContain('later');
  });

  it('calls the hooks once per token', async () => {
    let calls = 0;
    const ship = await Nexus.create(
      defineModule({
        name: 'Shell',
        providers: [provide(shellAuth, { useValue: 'shell-auth' })],
      }),
      {
        plugins: [
          {
            ...byDescription,
            tokenKey: (token: unknown) => {
              calls++;
              return byDescription.tokenKey(token);
            },
          },
        ],
      },
    );
    ship.get(remoteAuth);
    const before = calls;
    ship.get(remoteAuth);
    ship.has(shellAuth);
    expect(calls).toBe(before);
  });

  it('reports a throwing tokenKey as NEXUS_PLUGIN_FAILED once per token', async () => {
    const cause = new Error('no key');
    class Remote {
      static deps = [optional(remoteAuth)] as const;
      constructor(readonly auth: string | undefined) {}
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Shell',
          providers: [provide(remoteAuth, { useValue: 'x' }), Remote],
        }),
        {
          plugins: [
            {
              name: 'broken',
              apiVersion: 1,
              tokenKey: (token: unknown) => {
                if (token === remoteAuth) throw cause;
                return undefined;
              },
            },
          ],
        },
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_PLUGIN_FAILED',
          plugin: 'broken',
          hook: 'tokenKey',
          cause,
        },
      ],
    });
  });

  it('throws NEXUS_PLUGIN_FAILED from get() when tokenKey throws there', async () => {
    const cause = new Error('no key');
    const ship = await Nexus.create(defineModule({ name: 'Shell' }), {
      plugins: [
        {
          name: 'broken',
          apiVersion: 1,
          tokenKey: (token: unknown) => {
            if (token === remoteAuth) throw cause;
            return undefined;
          },
        },
      ],
    });
    let error: unknown;
    try {
      ship.get(remoteAuth);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toMatchObject({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'broken',
      hook: 'tokenKey',
      cause,
    });
  });

  it('rejects a tokenKey that is not a function', async () => {
    const error = await rejected(
      Nexus.create(defineModule({ name: 'Shell' }), {
        plugins: [{ name: 'bad', apiVersion: 1, tokenKey: 'key' }] as never,
      }),
    );
    expect(error).toMatchObject({
      errors: [{ plugin: 'bad', reason: 'bad-hook', detail: ['tokenKey'] }],
    });
  });
});
