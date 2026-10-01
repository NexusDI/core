# Node examples

## The request in a scoped factory

A scoped factory reads `REQUEST`, and `current()` finds the scope.

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
