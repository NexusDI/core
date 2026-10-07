# @nexusdi/errors

[![npm](https://img.shields.io/npm/v/@nexusdi/errors/next)](https://www.npmjs.com/package/@nexusdi/errors)
[![license](https://img.shields.io/npm/l/@nexusdi/errors)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Human-readable diagnostics for NexusDI wiring errors.**

By default, NexusDI reports each wiring error with a short code. The code suits machines and reads as cryptic to developers.

`@nexusdi/errors` is a plugin that turns these codes into detailed, human-readable messages that explain exactly what went wrong and how to fix it.

## Why use this plugin?

When a container fails to start, the `errors()` plugin provides:

- **Detailed Explanations:** You get a sentence, not only a code, explaining the missing dependency.
- **Actionable Fixes:** Every error includes a `Fix:` line that tells you exactly which export or import to add.
- **Near-Miss Analysis:** If a token is provided in another module but not exported, the plugin tells you exactly where it is found.
- **Logged Errors:** `explain(error)` gives an error caught without the plugin the same text.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/errors@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => `course to ${to}`;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class Helm {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});
const Bridge = defineModule({ name: 'Bridge', providers: [Helm] });
const App = defineModule({ name: 'App', imports: [Bridge, Tactical] });

const plugins = [errors()];
const fail = (error: { errors: Error[] }) => error.errors[0]?.message ?? '';
const before = await Nexus.create(App).then(() => '', fail);
const result = await Nexus.create(App, { plugins }).then(() => '', fail);
before.split(' ').slice(1, 4).join(' '); // -> 'token=NavCharts requester=Helm module=Bridge.'
result.split('\n').slice(1); // -> ['  NavCharts is provided in Tactical, which does not export it.', "  Fix: add NavCharts to Tactical's exports and import Tactical into Bridge."]
```

The first claim is core's one-line message, and the second is the text `errors()` adds under it.

## Documentation

- [Error Codes Reference](https://nexus.js.org/next/api-errors/)
- [Error Text Packs Guide](https://nexus.js.org/next/error-text/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/errors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
