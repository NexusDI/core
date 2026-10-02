# NEXUS_INVALID_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_INVALID_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import type { ProviderEntry } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

// A provider list read from configuration at run time, which TypeScript
// cannot check: a value takes no lifetime.
const fromConfig: unknown[] = [
  { token: REACTOR, useValue: { output: 1.21 }, lifetime: 'transient' },
];
const Engineering = defineModule({
  name: 'Engineering',
  providers: fromConfig as ProviderEntry[],
});

const thin = await Nexus.create(Engineering).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_INVALID_PROVIDER] module=Engineering index=0 reason=value-with-lifetime. https://nexus.js.org/errors/NEXUS_INVALID_PROVIDER'
console.log(line);

const full = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_INVALID_PROVIDER] Engineering.providers[0] sets a lifetime on useValue; a value has none.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useValue: { output: 1.21 } })],
});

await using ship = await Nexus.create(Engineering);
const output = ship.get(REACTOR).output; // -> 1.21
console.log(output);
```

<!-- #endregion fix -->
