# NEXUS_DEVTOOLS_GRAPH_INVALID examples

Regions for `apps/docs/content/errors/NEXUS_DEVTOOLS_GRAPH_INVALID.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { inspect, parseGraph } from '@nexusdi/devtools';

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

// A saved graph whose first provider lost its token, as a hand edit would.
const saved = JSON.parse(JSON.stringify(inspect(Engineering)));
delete saved.providers[0].token;

let path: string | null = null;
let message = '';
try {
  parseGraph(saved);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_DEVTOOLS_GRAPH_INVALID')) throw error;
  path = error.path;
  message = error.message;
}
const failed = path; // -> 'providers[0].token'
console.log(failed);
const lines = message.split('\n'); // -> ['[NEXUS_DEVTOOLS_GRAPH_INVALID] not a NexusGraph: providers[0].token is missing or has the wrong type.', '  Fix: pass JSON.parse of the text that JSON.stringify(graph(ship)), JSON.stringify(inspect(root)) or nexusdi graph --format json wrote.']
console.log(lines.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { inspect, parseGraph } from '@nexusdi/devtools';

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

const text = JSON.stringify(inspect(Engineering));
const token = parseGraph(JSON.parse(text)).providers[0]?.token; // -> 'ReactorCore'
console.log(token);
```

<!-- #endregion fix -->
