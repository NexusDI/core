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

## Installation

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
const result = await Nexus.create(App, { plugins }).then(() => '', fail);
result.split('\n').slice(1); // -> ['  NavCharts is provided in Tactical, which does not export it.', "  Fix: add NavCharts to Tactical's exports and import Tactical into Bridge."]
```

## Documentation

- [Error Codes Reference](https://nexus.js.org/next/api-errors/)
- [Error Text Packs Guide](https://nexus.js.org/next/error-text/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
