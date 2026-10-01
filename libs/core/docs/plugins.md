# Plugins

## A plugin

A plugin is a plain object with a `name`, an `apiVersion` and optional hooks.

<!-- #region plugins -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide, type NexusPlugin } from '@nexusdi/core';

interface IDatabase {
  query(sql: string): string;
}
interface IUserRepository {
  count(): string;
}
const DATABASE = new Token<IDatabase>('Database');
const USERS = new Token<IUserRepository>('UserRepository');
class PostgresClient implements IDatabase {
  query(sql: string) {
    return `ran ${sql}`;
  }
}
class UserRepository implements IUserRepository {
  static deps = [DATABASE] as const;
  constructor(readonly database: IDatabase) {}
  count() {
    return this.database.query('select count(*) from users');
  }
}

let constructed = 0;
const counter: NexusPlugin = {
  name: 'construct-counter',
  apiVersion: NEXUS_PLUGIN_API,
  observe(event) {
    if (event.type === 'construct') constructed++;
  },
};

await using app = await Nexus.create(
  defineModule({
    name: 'Api',
    providers: [
      provide(DATABASE, { useClass: PostgresClient }),
      provide(USERS, { useClass: UserRepository }),
    ],
  }),
  { plugins: [counter] },
);
constructed; // -> 2
```

<!-- #endregion plugins -->

## Canonical tokens

`canonical()` maps a token to the one a `tokenKey` plugin resolves it to.

<!-- #region plugin-canonical -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide, type NexusPlugin } from '@nexusdi/core';

interface IAuth {
  user(): string;
}
// Two copies of a contracts package each make their own token.
const shellAuth = new Token<IAuth>('bank/Auth');
const remoteAuth = new Token<IAuth>('bank/Auth');
class CrewAuth implements IAuth {
  user() {
    return 'crew';
  }
}

const byName: NexusPlugin = {
  name: 'by-name',
  apiVersion: NEXUS_PLUGIN_API,
  tokenKey: (token) => (token instanceof Token ? token.description : undefined),
};
let provided = false;
const probe: NexusPlugin = {
  name: 'auth-probe',
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    check(view) {
      const auth = view.canonical(remoteAuth);
      provided = view.providers.some((p) => p.token === auth);
    },
  },
};

await using app = await Nexus.create(
  defineModule({
    name: 'Shell',
    providers: [provide(shellAuth, { useClass: CrewAuth })],
  }),
  { plugins: [byName, probe] },
);
provided; // -> true
```

<!-- #endregion plugin-canonical -->
