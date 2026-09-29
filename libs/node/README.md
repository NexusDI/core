# @nexusdi/node

`nodeScopes()` binds a NexusDI scope to the async context of a request on Node, so code deep in the call chain finds it.

```bash
npm install @nexusdi/node @nexusdi/core
```

The version of `@nexusdi/node` must equal the version of `@nexusdi/core`.

## Node

`nodeScopes()` returns a `run` and a `current` over one `AsyncLocalStorage`. `run(scope, fn)` makes `scope` the current scope of everything `fn` awaits, and `current()` returns it, or `undefined` outside a run. It registers with no container, so one `nodeScopes()` serves every container of the process.

<!-- #region node -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

const MISSION = new Token<string>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});
await using ship = await Nexus.create(Tactical);
const scopes = nodeScopes();

async function dispatch() {
  await Promise.resolve();
  return scopes.current()?.get(MISSION);
}

await using shuttle = await ship.createScope({
  request: { mission: 'survey-7' },
});
const mission = await scopes.run(shuttle, () => dispatch()); // -> 'survey-7'
```

<!-- #endregion node -->

`@nexusdi/node` is the only NexusDI package that imports a `node:` module.

## License

MIT
