import {
  defineModule,
  lazy,
  Nexus,
  provide,
  Token,
  type BlueprintError,
  type Dep,
} from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../test-support/catch.js';
import type { InterceptorError } from './interceptor-error.js';
import { interceptor } from './options.js';
import { interceptors } from './plugin.js';
import type {
  CallContext,
  Interceptor,
  InterceptorsOptions,
  Next,
} from './types.js';

interface IUsers {
  find(id: string): string;
}
interface IDb {
  query(sql: string): string;
}

const USERS = new Token<IUsers>('Users');
const USERS_ALIAS = new Token<IUsers>('UsersAlias');
const DB = new Token<IDb>('Db');
const AUTH = new Token<Interceptor>('Auth');
const AUDIT = new Token<Interceptor>('Audit');

class Db implements IDb {
  query(sql: string): string {
    return sql;
  }
}

class Users implements IUsers {
  static deps = [DB] as const;
  constructor(private readonly db: IDb) {}
  find(id: string): string {
    return this.db.query(id);
  }
}

const UsersModule = defineModule({
  name: 'Users',
  providers: [
    provide(DB, { useClass: Db }),
    provide(USERS, { useClass: Users }),
    provide(USERS_ALIAS, { useExisting: USERS }),
  ],
  exports: [USERS, USERS_ALIAS, DB],
});

const App = defineModule({
  name: 'App',
  imports: [UsersModule],
  exports: [UsersModule],
});

/** An interceptor that records each call and depends on `deps`. */
function authWith(deps: readonly Dep[], seen: string[]) {
  return interceptor(AUTH, {
    deps,
    useFactory: (): Interceptor => ({
      intercept(call: CallContext, next: Next) {
        seen.push(`${call.provider.name}.${String(call.method)}`);
        return next();
      },
    }),
  } as never);
}

const reasons = (error: unknown) =>
  (error as BlueprintError).errors.map((inner) => {
    const { reason, token, target, detail } = inner as InterceptorError;
    return { reason, token, target, detail };
  });

const options = (
  deps: readonly Dep[],
  extra: Partial<InterceptorsOptions> = {},
): InterceptorsOptions => ({
  imports: [UsersModule],
  register: [authWith(deps, [])],
  global: [AUTH],
  ...extra,
});

describe('exempt', () => {
  it.each([
    ['required', [USERS], 'Users', ['Users', 'Db']],
    ['lazy', [lazy(USERS)], 'Users', ['Users', 'Db']],
    ['alias', [USERS_ALIAS], 'UsersAlias', ['UsersAlias', 'Users', 'Db']],
  ] as const)(
    'fails create for a %s dep missing from exempt, and names every provider it would skip',
    async (_kind, deps, target, skipped) => {
      const error = await rejected(
        Nexus.create(App, { plugins: [interceptors(options(deps))] }),
      );
      expect(reasons(error)).toEqual([
        { reason: 'unexempted-dep', token: 'Auth', target, detail: skipped },
      ]);
    },
  );

  it('skips global entries on an exempted service and what it reaches, and keeps its declarations', async () => {
    const seen: string[] = [];
    class Orders {
      static interceptors = { methods: { place: [AUDIT] } };
      static deps = [USERS] as const;
      constructor(private readonly users: IUsers) {}
      place(id: string): string {
        return this.users.find(id);
      }
    }
    const DeclaredUsers = defineModule({
      name: 'App',
      imports: [UsersModule],
      providers: [Orders],
      exports: [UsersModule],
    });
    await using ship = await Nexus.create(DeclaredUsers, {
      plugins: [
        interceptors({
          imports: [UsersModule],
          register: [
            authWith([lazy(USERS)], seen),
            interceptor(AUDIT, {
              useValue: {
                intercept: (call, next) => (
                  seen.push(`audit ${String(call.method)}`),
                  next()
                ),
              },
            }),
          ],
          global: [AUTH],
          bindings: [{ token: USERS, methods: { find: [AUDIT] } }],
          exempt: [USERS],
        }),
      ],
    });
    expect(ship.get(Orders).place('7')).toBe('7');
    expect(seen).toEqual(['Orders.place', 'audit place', 'audit find']);
    seen.length = 0;
    ship.get(DB).query('x');
    expect(seen).toEqual([]);
  });

  it('needs no entry for a dep in providers', async () => {
    const HELPER = new Token<IDb>('Helper');
    await using ship = await Nexus.create(App, {
      plugins: [
        interceptors({
          providers: [provide(HELPER, { useClass: Db })],
          register: [authWith([HELPER], [])],
          global: [AUTH],
        }),
      ],
    });
    expect(ship.get(USERS).find('1')).toBe('1');
  });

  it('fails for an exempt entry no interceptor depends on, and names the root that covers it', async () => {
    const error = await rejected(
      Nexus.create(App, {
        plugins: [interceptors(options([USERS], { exempt: [USERS, DB] }))],
      }),
    );
    expect(reasons(error)).toEqual([
      { reason: 'unused-exempt', token: null, target: 'Db', detail: ['Users'] },
    ]);
  });

  it('runs neither check without global entries', async () => {
    await using ship = await Nexus.create(App, {
      plugins: [interceptors(options([USERS], { global: [], exempt: [DB] }))],
    });
    expect(ship.get(USERS).find('1')).toBe('1');
  });

  it('reports each reason from Nexus.check', () => {
    class Journal {
      static interceptors = { class: [AUTH] };
      write(): void {}
    }
    const JOURNAL = new Token<Journal>('Journal');
    const error = thrown(() =>
      Nexus.check(
        defineModule({
          name: 'App',
          imports: [UsersModule],
          providers: [provide(JOURNAL, { useClass: Journal })],
          exports: [JOURNAL],
        }),
        {
          plugins: [
            interceptors(
              options([USERS, JOURNAL], {
                imports: [
                  UsersModule,
                  defineModule({
                    name: 'JournalHost',
                    providers: [provide(JOURNAL, { useClass: Journal })],
                    exports: [JOURNAL],
                  }),
                ],
                exempt: [JOURNAL, DB],
              }),
            ),
          ],
        },
      ),
    );
    expect(reasons(error).map((r) => r.reason)).toEqual([
      'unexempted-dep',
      'unused-exempt',
      'self-intercept',
    ]);
  });
});

describe('self-intercept', () => {
  it('fails when a service the interceptor depends on names it in a class list', async () => {
    class Journal {
      static interceptors = { class: [AUTH] };
      write(): void {}
    }
    const JOURNAL = new Token<Journal>('Journal');
    const JournalModule = defineModule({
      name: 'Journal',
      providers: [provide(JOURNAL, { useClass: Journal })],
      exports: [JOURNAL],
    });
    const error = await rejected(
      Nexus.create(defineModule({ name: 'App' }), {
        plugins: [
          interceptors({
            imports: [JournalModule],
            register: [authWith([JOURNAL], [])],
          }),
        ],
      }),
    );
    expect(reasons(error)).toEqual([
      {
        reason: 'self-intercept',
        token: 'Auth',
        target: 'Journal',
        detail: [],
      },
    ]);
  });

  it('fails through a transitive dep and through a binding', async () => {
    const error = await rejected(
      Nexus.create(defineModule({ name: 'App' }), {
        plugins: [
          interceptors({
            imports: [UsersModule],
            register: [authWith([USERS], [])],
            bindings: [{ token: DB, class: [AUTH] }],
          }),
        ],
      }),
    );
    expect(reasons(error)).toEqual([
      { reason: 'self-intercept', token: 'Auth', target: 'Db', detail: [] },
    ]);
  });

  it('allows a method list on a service the interceptor depends on', async () => {
    await using ship = await Nexus.create(App, {
      plugins: [
        interceptors({
          imports: [UsersModule],
          register: [authWith([USERS], [])],
          bindings: [{ token: DB, methods: { query: [AUTH] } }],
        }),
      ],
    });
    expect(ship.get(USERS).find('1')).toBe('1');
  });
});
