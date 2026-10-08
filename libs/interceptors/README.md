# @nexusdi/interceptors

[![npm](https://img.shields.io/npm/v/@nexusdi/interceptors/next)](https://www.npmjs.com/package/@nexusdi/interceptors)
[![license](https://img.shields.io/npm/l/@nexusdi/interceptors)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Decouple cross-cutting concerns from your business logic using transparent method wrappers.**

Mixing audit logging, performance tracking, or input validation directly into your services creates bloated classes and violates the single-responsibility principle. When business logic is entangled with infrastructure concerns, services become harder to test and maintain.

`@nexusdi/interceptors` solves this by providing a plugin for [NexusDI](https://www.npmjs.com/package/@nexusdi/core) that wraps service methods in a proxy layer. This allows you to inject logic (such as result caching or sensitive method auditing) without modifying the service implementation.

## Key Features

**Interceptors are defined as providers.** They must implement an `intercept(call, next)` method to modify arguments, short-circuit calls, or observe results via `tap()`.

**Attachment is highly granular.** You can apply interceptors globally, to specific tokens, to an entire class, or to a single method.

**Execution relies on transparent proxies.** All calls resolved through `get()` are intercepted, while internal calls via `this` remain direct.

**Technical Specifications.** This package is ESM-only and requires matching `@next` versions for `@nexusdi/core` to avoid peer dependency conflicts.

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
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/interceptors/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
