# NEXUS_DEVTOOLS_PROFILE_INVALID examples

Regions for `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_INVALID.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, defineModule, isNexusError, provide } from '@nexusdi/core';
import { parseProfileReport, profileStartup } from '@nexusdi/devtools';

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

// A saved report whose first build lost its start time, as a hand edit would.
const saved = JSON.parse(JSON.stringify(await profileStartup(Engineering)));
delete saved.runs[0].builds[0].startMs;

let path: string | null = null;
let message = '';
try {
  parseProfileReport(saved);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_DEVTOOLS_PROFILE_INVALID')) throw error;
  path = error.path;
  message = error.message;
}
const failed = path; // -> 'runs[0].builds[0].startMs'
console.log(failed);
const lines = message.split('\n'); // -> ['[NEXUS_DEVTOOLS_PROFILE_INVALID] not a ProfileReport: runs[0].builds[0].startMs is missing or has the wrong type.', '  Fix: re-record the report with this version of @nexusdi/devtools.']
console.log(lines.join('\n'));
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { parseProfileReport, profileStartup } from '@nexusdi/devtools';

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

// What JSON.stringify wrote, read back unedited.
const text = JSON.stringify(await profileStartup(Engineering));
const runs = parseProfileReport(JSON.parse(text)).runs.length; // -> 1
console.log(runs);
```

<!-- #endregion fix -->
