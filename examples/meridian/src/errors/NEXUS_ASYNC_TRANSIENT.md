# NEXUS_ASYNC_TRANSIENT examples

Regions for `apps/docs/content/errors/NEXUS_ASYNC_TRANSIENT.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

// launchDrone stands in for a JavaScript helper whose typings say it returns
// a drone. At run time it returns a promise, which TypeScript cannot see.
const launchDrone = (async (serial: number) => ({ serial })) as unknown as (
  serial: number,
) => ISurveyDrone;

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(DRONE, {
      useFactory: () => launchDrone(7),
      lifetime: 'transient',
    }),
  ],
  exports: [DRONE],
});

const getDrone = (ship: Nexus) => {
  try {
    return ship.get(DRONE);
  } catch (error) {
    return error;
  }
};

await using ship = await Nexus.create(Tactical);
const thin = getDrone(ship);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_ASYNC_TRANSIENT] token=SurveyDrone module=Tactical. https://nexus.js.org/errors/NEXUS_ASYNC_TRANSIENT'
console.log(line);

await using fullShip = await Nexus.create(Tactical, { plugins: [errors()] });
const full = getDrone(fullShip);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_ASYNC_TRANSIENT] SurveyDrone (module Tactical) is transient and its factory returned a promise. get() is synchronous and cannot wait for it.', "  Fix: use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>."]
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

async function launchDrone(serial: number): Promise<ISurveyDrone> {
  return { serial };
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(DRONE, {
      useFactory: () => launchDrone(7),
      lifetime: 'scoped',
    }),
  ],
  exports: [DRONE],
});

await using ship = await Nexus.create(Tactical);
await using shuttle = await ship.createScope();
const serial = shuttle.get(DRONE).serial; // -> 7
console.log(serial);
```

<!-- #endregion fix -->
