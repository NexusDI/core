# Node examples

## The request in a scoped factory

A scoped factory reads `REQUEST`, and `current()` finds the scope.

<!-- #region node -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

interface Mission {
  readonly id: string;
  readonly target: string;
}

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: Mission;
  }
}

const MISSION = new Token<Mission>('Mission');
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
  return scopes.current()?.get(MISSION).id;
}

await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const missionId = await scopes.run(shuttle, () => dispatch()); // -> 'survey-7'
```

<!-- #endregion node -->
