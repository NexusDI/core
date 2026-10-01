# @nexusdi/interceptors

[![npm](https://img.shields.io/npm/v/@nexusdi/interceptors/next)](https://www.npmjs.com/package/@nexusdi/interceptors)
[![license](https://img.shields.io/npm/l/@nexusdi/interceptors)](https://github.com/NexusDI/core/blob/main/LICENSE)

Wrap NexusDI service methods with logging, metrics, validation or caching.

`interceptors()` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that runs your code around the methods of the services a container builds. Write an audit log or a timer once, and attach it where you need it.

- An interceptor is a provider with an `intercept(call, next)` method.
- Attach one globally, per token, per class or per method.
- Interceptors get their own dependencies from the container.
- `tap(next, { value, error })` observes sync and async results alike.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/interceptors@next @nexusdi/core@next
```

## Usage

<!-- #region call-order -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { interceptor, interceptors, tap } from '@nexusdi/interceptors';
import type { Interceptor } from '@nexusdi/interceptors';
interface INavigator {
  plot(to: string): string;
}
class Navigator implements INavigator {
  plot = (to: string) => `course to ${to}`;
}
const NAVIGATOR = new Token<INavigator>('Navigator');
const AUDIT = new Token<Interceptor>('Audit');
const log: string[] = [];
const audit = interceptor(AUDIT, {
  useValue: {
    intercept: (call, next) => {
      log.push(`call ${String(call.method)}`);
      return tap(next, { value: (course) => log.push(`got ${course}`) });
    },
  },
});
const plugins = [interceptors({ register: [audit], global: [AUDIT] })];
const providers = [provide(NAVIGATOR, { useClass: Navigator })];
await using ship = await Nexus.create(providers, { plugins });
ship.get(NAVIGATOR).plot('Vega'); // -> 'course to Vega'
log; // -> ['call plot', 'got course to Vega']
```

<!-- #endregion call-order -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/interceptors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
