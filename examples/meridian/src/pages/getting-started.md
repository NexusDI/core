# Getting started examples

Regions for `apps/docs/content/getting-started.mdx`. Every block runs as a test.

<!-- #region first-ship -->

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';

class FusionReactor {
  readonly output = 1.21;
}

class QuantumComputer {
  static deps = [FusionReactor] as const;
  constructor(readonly reactor: FusionReactor) {}

  status(): string {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}

await using ship = await Nexus.create([FusionReactor, QuantumComputer]);

const status = ship.get(QuantumComputer).status(); // -> 'ShipComputer online. Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion first-ship -->

<!-- #region missing-reactor -->

```ts @import.meta.vitest
import { Nexus, isNexusError } from '@nexusdi/core';

class FusionReactor {
  readonly output = 1.21;
}

class QuantumComputer {
  static deps = [FusionReactor] as const;
  constructor(readonly reactor: FusionReactor) {}
}

const error = await Nexus.create([QuantumComputer]).catch(
  (caught: unknown) => caught,
);

if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;

const code = error.code; // -> 'NEXUS_BLUEPRINT_INVALID'
console.log(code);

const first = error.errors[0]?.message; // -> '[NEXUS_MISSING_PROVIDER] token=FusionReactor requester=QuantumComputer module=root. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(first);
```

<!-- #endregion missing-reactor -->

<!-- #region devtools-message -->

```ts @import.meta.vitest
import { Nexus, isNexusError } from '@nexusdi/core';
import { devtools } from '@nexusdi/devtools';

class FusionReactor {
  readonly output = 1.21;
}

class QuantumComputer {
  static deps = [FusionReactor] as const;
  constructor(readonly reactor: FusionReactor) {}
}

const dev = process.env.NODE_ENV !== 'production';

const error = await Nexus.create([QuantumComputer], {
  plugins: dev ? [devtools()] : [],
}).catch((caught: unknown) => caught);

if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;

const message = error.errors[0]?.message.split('\n'); // -> ['[NEXUS_MISSING_PROVIDER] QuantumComputer (module root) depends on FusionReactor, but no provider of FusionReactor is visible in root.', '  Fix: provide FusionReactor in root or in a module root imports.']
console.log(message);
```

<!-- #endregion devtools-message -->
