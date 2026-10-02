# NEXUS_MODULE_OPTIONS_MISSING examples

Regions for `apps/docs/content/errors/NEXUS_MODULE_OPTIONS_MISSING.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

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
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Comms] });

const thin = await Nexus.create(Meridian).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_MODULE_OPTIONS_MISSING] module=Comms. https://nexus.js.org/errors/NEXUS_MODULE_OPTIONS_MISSING'
console.log(line);

const full = await Nexus.create(Meridian, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_MODULE_OPTIONS_MISSING] Comms is configurable and was imported without forRoot() or forRootAsync().', '  Fix: import Comms.forRoot(options) or Comms.forRootAsync({ useFactory }).']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

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
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Comms.forRoot({ frequency: 1420 })],
});

await using ship = await Nexus.create(Meridian);
const frequency = ship.get(SUBSPACE_LINK).frequency; // -> 1420
console.log(frequency);
```

<!-- #endregion fix -->
