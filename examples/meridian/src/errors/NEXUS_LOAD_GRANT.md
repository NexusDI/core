# NEXUS_LOAD_GRANT examples

Regions for `apps/docs/content/errors/NEXUS_LOAD_GRANT.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface ICommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IScoutProbe {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<ICommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const SCOUT_PROBE = new Token<IScoutProbe>('ScoutProbe');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: ICommsOptions) {
    this.frequency = options.frequency;
  }
}
class ScoutProbe implements IScoutProbe {
  static deps = [SUBSPACE_LINK] as const;
  constructor(private readonly link: ISubspaceLink) {}
  get frequency() {
    return this.link.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Survey = defineModule({
  name: 'Survey',
  providers: [provide(SCOUT_PROBE, { useClass: ScoutProbe })],
  exports: [SCOUT_PROBE],
});
// Each forRoot() call makes a new definition, so the host's copy and the
// grant's copy are two modules.
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Comms.forRoot({ frequency: 1701 })],
});

await using ship = await Nexus.create(Meridian);
const thin = await ship
  .load(Survey, { imports: [Comms.forRoot({ frequency: 1701 })] })
  .catch((error: unknown) => error);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_LOAD_GRANT] module=Survey grant=Comms reason=not-in-graph. https://nexus.js.org/errors/NEXUS_LOAD_GRANT'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
const full = await fullShip
  .load(Survey, { imports: [Comms.forRoot({ frequency: 1701 })] })
  .catch((error: unknown) => error);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_LOAD_GRANT] Survey is loaded with a grant for Comms, and the graph holds no module with that definition.', '  Fix: grant the object the host imported (a forRoot() call makes a new one), or import Comms from a host module first.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface ICommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IScoutProbe {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<ICommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const SCOUT_PROBE = new Token<IScoutProbe>('ScoutProbe');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: ICommsOptions) {
    this.frequency = options.frequency;
  }
}
class ScoutProbe implements IScoutProbe {
  static deps = [SUBSPACE_LINK] as const;
  constructor(private readonly link: ISubspaceLink) {}
  get frequency() {
    return this.link.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Survey = defineModule({
  name: 'Survey',
  providers: [provide(SCOUT_PROBE, { useClass: ScoutProbe })],
  exports: [SCOUT_PROBE],
});
// One forRoot() result, imported by the host and granted to the section.
const comms = Comms.forRoot({ frequency: 1701 });
const Meridian = defineModule({ name: 'Meridian', imports: [comms] });

await using ship = await Nexus.create(Meridian);
await ship.load(Survey, { imports: [comms] });
const frequency = ship.get(SCOUT_PROBE).frequency; // -> 1701
console.log(frequency);
```

<!-- #endregion fix -->
