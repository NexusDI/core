# @nexusdi/errors

[![npm](https://img.shields.io/npm/v/@nexusdi/errors/next)](https://www.npmjs.com/package/@nexusdi/errors)
[![license](https://img.shields.io/npm/l/@nexusdi/errors)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Debug your dependency graph instantly with actionable, human-readable diagnostics.**

When a NexusDI container fails to start, you usually see a short error code. While efficient for machines, these codes are cryptic to developers and leave you guessing why a dependency is missing or where a binding failed.

`@nexusdi/errors` transforms these codes into detailed explanations. It analyzes your module graph to tell you exactly what went wrong and provides a specific "Fix" line to resolve the issue.

## Key Features

The plugin provides diagnostic intelligence for complex wiring scenarios.

- **Detailed Explanations:** Replaces short codes with full sentences describing the failure.
- **Actionable Fixes:** Includes a `Fix:` line directing you to the specific export or import needed.
- **Near-Miss Analysis:** Identifies tokens provided in other modules that were not exported.
- **Manual Diagnosis:** The `explain(error)` function converts caught errors into readable text.
- **Technical Spec:** ESM-only; requires `@nexusdi/core` (matching version).

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/errors@next @nexusdi/core@next
```

## Quick Example

The following example compares the standard core error message with the enriched output provided by the `errors()` plugin.

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

## Documentation

- [Error Codes Reference](https://nexus.js.org/next/api-errors/)
- [Error Text Packs Guide](https://nexus.js.org/next/error-text/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/errors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
