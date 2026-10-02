# NEXUS_DEVTOOLS_UNREGISTERED examples

Regions for `apps/docs/content/errors/NEXUS_DEVTOOLS_UNREGISTERED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { isNexusError, provide } from '@nexusdi/core';
import { graph } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

await using ship = await Nexus.create(Engineering);

let code = '';
let message = '';
try {
  graph(ship);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_DEVTOOLS_UNREGISTERED')) throw error;
  code = error.code;
  message = error.message;
}
const thrown = code; // -> 'NEXUS_DEVTOOLS_UNREGISTERED'
console.log(thrown);
const lines = message.split('\n'); // -> ['[NEXUS_DEVTOOLS_UNREGISTERED] graph() reads the container through devtools(), and this container was created without it.', "  Fix: register devtools() in Nexus.create's plugins: Nexus.create(Root, { plugins: [devtools()] })."]
console.log(lines.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

await using ship = await Nexus.create(Engineering, { plugins: [devtools()] });
const drawn = graph(ship).providers.filter((provider) => !provider.internal);
const tokens = drawn.map((provider) => provider.token); // -> ['ReactorCore']
console.log(tokens);
```

<!-- #endregion fix -->
