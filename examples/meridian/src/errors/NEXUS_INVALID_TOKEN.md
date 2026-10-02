# NEXUS_INVALID_TOKEN examples

Regions for `apps/docs/content/errors/NEXUS_INVALID_TOKEN.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, isNexusError } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}

let caught: unknown;
try {
  new Token<IReactorCore>('');
} catch (error) {
  caught = error;
}
const line = isNexusError(caught) ? caught.message : null; // -> '[NEXUS_INVALID_TOKEN] the string "" is not a token description. A Token needs a non-empty description string.'
console.log(line);
```

<!-- #endregion reproduce -->

<!-- #region reproduce-symbol -->

```ts @import.meta.vitest
import { Nexus, Token, isNexusError, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

await using ship = await Nexus.create(
  [provide(REACTOR, { useClass: FusionReactor })],
  { plugins: [errors()] },
);

// A 0.3 symbol token, which TypeScript would reject without the cast.
const legacy = Symbol.for('ReactorCore') as never;
let caught: unknown;
try {
  ship.get(legacy);
} catch (error) {
  caught = error;
}
const text = isNexusError(caught) ? caught.message : null; // -> '[NEXUS_INVALID_TOKEN] the symbol Symbol(ReactorCore) is not a token. A token is a class, a Token or a MultiToken.'
console.log(text);
```

<!-- #endregion reproduce-symbol -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

await using ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
]);
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
