# @nexusdi/errors

[![npm](https://img.shields.io/npm/v/@nexusdi/errors/next)](https://www.npmjs.com/package/@nexusdi/errors)
[![license](https://img.shields.io/npm/l/@nexusdi/errors)](https://github.com/NexusDI/core/blob/main/LICENSE)

Every NexusDI error explained, with the fix and the provider you probably meant.

`errors()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that turns core's one-line error into sentences with a fix line. Register it in development and tests, and a failed startup tells you which export or import to add.

- Each message names the missing token and the class that asked.
- A fix line names the change that makes the graph valid.
- Near misses name the module that already has the token.
- `explain(error)` gives an error caught without the plugin the same text.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/errors@next @nexusdi/core@next
```

## Usage

<!-- #region before-after -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot = (to: string) => `course to ${to}`;
}
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
const fail = (error: { errors: Error[] }) => error.errors[0]?.message ?? '';
const plugins = [errors()];
const before = await Nexus.create(App).then(() => '', fail);
const after = await Nexus.create(App, { plugins }).then(() => '', fail);
before.split(' ').slice(1, 4).join(' '); // -> 'token=NavCharts requester=Helm module=Bridge.'
after.split('\n').slice(1); // -> ['  NavCharts is provided in Tactical, which does not export it.', "  Fix: add NavCharts to Tactical's exports and import Tactical into Bridge."]
```

<!-- #endregion before-after -->

The first claim is core's message, and the second is the text `errors()` adds under it.

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/errors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
