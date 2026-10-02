# NEXUS_INVALID_MODULE_OPTIONS examples

Regions for `apps/docs/content/errors/NEXUS_INVALID_MODULE_OPTIONS.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors, explain } from '@nexusdi/errors';
import * as v from 'valibot';

interface CommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: CommsOptions) {
    this.frequency = options.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema: v.object({
    frequency: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Comms.forRoot({ frequency: -5 })],
});

const failed = await Nexus.create(Meridian, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(failed, 'NEXUS_PROVIDER_FAILED')) throw failed;
const cause = failed.cause;
if (!isNexusError(cause, 'NEXUS_INVALID_MODULE_OPTIONS')) throw failed;
const line = cause.message; // -> '[NEXUS_INVALID_MODULE_OPTIONS] module=Comms. https://nexus.js.org/errors/NEXUS_INVALID_MODULE_OPTIONS'
console.log(line);
const text = explain(cause)?.message.split('\n'); // -> ['Comms received options its schema rejects:', '  frequency: Invalid value: Expected >=1 but received -5']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import * as v from 'valibot';

interface CommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: CommsOptions) {
    this.frequency = options.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema: v.object({
    frequency: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Comms.forRoot({ frequency: 1420 })],
  }),
);
const frequency = ship.get(SUBSPACE_LINK).frequency; // -> 1420
console.log(frequency);
```

<!-- #endregion fix -->
