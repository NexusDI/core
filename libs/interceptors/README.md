# @nexusdi/interceptors

[![npm](https://img.shields.io/npm/v/@nexusdi/interceptors/next)](https://www.npmjs.com/package/@nexusdi/interceptors)
[![license](https://img.shields.io/npm/l/@nexusdi/interceptors)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Run cross-cutting logic around your service methods.**

`@nexusdi/interceptors` is a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that allows you to wrap service methods with interceptors. This is the ideal place for logic that doesn't belong in the business service itself, such as:

- **Audit Logging:** Record every call to a sensitive method.
- **Performance Metrics:** Measure the execution time of specific services.
- **Input Validation:** Validate request arguments before they reach the service.
- **Result Caching:** Skip expensive method calls by returning a saved value.

## Core Concepts

- **The Interceptor:** A provider with an `intercept(call, next)` method. It can modify arguments, observe sync and async results alike using `tap()`, or short-circuit the call.
- **Flexible Attachment:** Attach interceptors globally, per token, to a specific class, or to a single method. Interceptors get their own dependencies from the container.
- **Proxy-Based:** Interceptors work via a transparent proxy. Calls through `get()` are intercepted; internal calls via `this` are not.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/interceptors@next @nexusdi/core@next
```

## Quick Example

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

ship.get(NAVIGATOR).plot('Vega');
log; // -> ['call plot', 'got course to Vega']
```

## Documentation

- [Detailed Interceptors Guide](https://nexus.js.org/next/interceptors/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/interceptors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
