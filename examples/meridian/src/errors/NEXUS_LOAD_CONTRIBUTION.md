# NEXUS_LOAD_CONTRIBUTION examples

Regions for `apps/docs/content/errors/NEXUS_LOAD_CONTRIBUTION.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { MultiToken, Nexus, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

const SYSTEMS = new MultiToken<string>('Systems');

const Survey = defineModule({
  name: 'Survey',
  providers: [provide(SYSTEMS, { useValue: 'scout' })],
  exports: [SYSTEMS],
});
const Meridian = defineModule({ name: 'Meridian' });

await using ship = await Nexus.create(Meridian);
const thin = await ship.load(Survey).catch((error: unknown) => error);
const line = isNexusError(thin) ? thin.message : null; // -> '[NEXUS_LOAD_CONTRIBUTION] module=Survey token=Systems. https://nexus.js.org/errors/NEXUS_LOAD_CONTRIBUTION'
console.log(line);

await using fullShip = await Nexus.create(Meridian, { plugins: [errors()] });
const full = await fullShip.load(Survey).catch((error: unknown) => error);
const text = isNexusError(full) ? full.message.split('\n') : null; // -> ['[NEXUS_LOAD_CONTRIBUTION] Survey publishes a contribution to Systems, and load() cannot add to a multi token: collectors built at startup hold their lists.', "  Fix: drop the contribution from Survey and register the provider from its onInit through the collector's registry, and unregister it on dispose."]
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token, all, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface IFleetRoster {
  register(name: string): () => void;
  names(): string[];
}
interface IScoutWing {
  readonly size: number;
}
const SYSTEMS = new MultiToken<string>('Systems');
const FLEET_ROSTER = new Token<IFleetRoster>('FleetRoster');
const SCOUT_WING = new Token<IScoutWing>('ScoutWing');

class FleetRoster implements IFleetRoster {
  static deps = [all(SYSTEMS)] as const;
  private readonly systems: string[];
  constructor(systems: string[]) {
    this.systems = [...systems];
  }
  register(name: string) {
    this.systems.push(name);
    return () => {
      this.systems.splice(this.systems.indexOf(name), 1);
    };
  }
  names() {
    return [...this.systems];
  }
}
const Fleet = defineModule({
  name: 'Fleet',
  providers: [provide(FLEET_ROSTER, { useClass: FleetRoster })],
  exports: [FLEET_ROSTER],
});

class ScoutWing implements IScoutWing {
  static deps = [FLEET_ROSTER] as const;
  readonly size = 1;
  private unregister: (() => void) | undefined;
  constructor(private readonly roster: IFleetRoster) {}
  onInit() {
    this.unregister = this.roster.register('scout');
  }
  [Symbol.dispose]() {
    this.unregister?.();
  }
}
const Survey = defineModule({
  name: 'Survey',
  imports: [Fleet],
  providers: [provide(SCOUT_WING, { useClass: ScoutWing })],
  exports: [SCOUT_WING],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Fleet] }),
);
await ship.load(Survey);
const names = ship.get(FLEET_ROSTER).names(); // -> ['scout']
console.log(names);
```

<!-- #endregion fix -->
