import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { optional } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

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
              check: (view) => void (tokens = view.edges.map((e) => e.token)),
            },
          },
        ],
      },
    );
    expect(tokens).toEqual([remoteAuth]);
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
              check: (view) => void (tokens = view.edges.map((e) => e.token)),
            },
          },
        ],
      },
    );
    expect(tokens).toEqual([remoteAuth]);
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
