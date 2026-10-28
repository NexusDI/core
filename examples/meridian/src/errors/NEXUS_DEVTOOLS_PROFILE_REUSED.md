# NEXUS_DEVTOOLS_PROFILE_REUSED examples

Regions for `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  provide,
} from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

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

const profiler = profile();
await (
  await Nexus.create(Engineering, { plugins: [profiler] })
)[Symbol.asyncDispose]();
await (
  await Nexus.create(Engineering, { plugins: [profiler] })
)[Symbol.asyncDispose]();

const reused = (() => {
  try {
    return profiler.report();
  } catch (error) {
    return error;
  }
})();
if (!isNexusError(reused, 'NEXUS_DEVTOOLS_PROFILE_REUSED')) throw reused;
const code = reused.code; // -> 'NEXUS_DEVTOOLS_PROFILE_REUSED'
console.log(code);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

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

async function profiled(): Promise<number> {
  const profiler = profile();
  await (
    await Nexus.create(Engineering, { plugins: [profiler] })
  )[Symbol.asyncDispose]();
  return profiler.report().runs.length;
}

const runs = [await profiled(), await profiled()]; // -> [1, 1]
console.log(runs);
```

<!-- #endregion fix -->
