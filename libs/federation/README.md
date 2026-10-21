# @nexusdi/federation

[![npm](https://img.shields.io/npm/v/@nexusdi/federation/next)](https://www.npmjs.com/package/@nexusdi/federation)
[![license](https://img.shields.io/npm/l/@nexusdi/federation)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Unify dependency singleton instances across micro-frontend shells and remotes.**

Micro-frontend architectures often bundle shells and remotes separately, causing shared libraries to be duplicated. This leads to multiple instances of services that must be singletons (such as authentication or configuration providers), creating fragmented state and runtime bugs.

`@nexusdi/federation` solves this by introducing **Versioned Contracts**, allowing separate bundles to resolve the same provider if they agree on the contract version.

```ts @import.meta.vitest
import { Nexus, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => `course to ${to}`;
}

const meridian = defineContract({ key: 'meridian', version: '2.3.0' });
const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');

const providers = [provide(NAV_CHARTS, { useClass: StarCharts })];
await using ship = await Nexus.create(providers, { plugins: [federation()] });
ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
```

## Key Features

**The federation plugin synchronizes tokens across bundles.** The `federation()` plugin ensures every copy of a contract token resolves to the same provider in the container. It binds the copies by contract key and token name, such as `meridian/NavCharts`.

**Version safety prevents runtime crashes.** NexusDI applies npm `^` range rules to contracts so a remote requiring `1.1.0` can bind to a shell providing `1.2.0`, while a remote requiring `2.0.0` will fail to bind to `1.0.0`.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/federation@next @nexusdi/core@next
```

## Quick Example

A remote bundles its own copy of the contracts package, so its `NAV_CHARTS` is another token object. `federation()` binds that copy to the shell's provider by its key, `meridian/NavCharts`.

```ts @import.meta.vitest
import { Nexus, defineModule, provide } from '@nexusdi/core';
import { defineContract, federation } from '@nexusdi/federation';

interface INavCharts {
  plot(to: string): string;
}
class StarCharts implements INavCharts {
  plot = (to: string) => `course to ${to}`;
}

// The shell's copy of the contracts package, and a remote's copy.
const shell = defineContract({ key: 'meridian', version: '2.3.0' });
const remote = defineContract({ key: 'meridian', version: '2.3.0' });
const NAV_CHARTS = shell.token<INavCharts>('NavCharts');

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

await using ship = await Nexus.create(Meridian, { plugins: [federation()] });
const charts = ship.get(remote.token<INavCharts>('NavCharts'));
charts === ship.get(NAV_CHARTS); // -> true
```

## Documentation

- [@nexusdi/federation API](https://nexus.js.org/next/api-federation/)
- [Plugins Guide](https://nexus.js.org/next/plugins/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
