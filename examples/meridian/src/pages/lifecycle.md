# Lifecycle and disposal examples

Regions for `apps/docs/content/lifecycle.mdx`. Every block runs as a test.

<!-- #region on-init -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  async onInit() {
    log.push('reactor online');
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
  onInit() {
    log.push(`computer self-test at ${this.reactor.output}`);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(REACTOR, { useClass: FusionReactor }),
  ],
});

await using ship = await Nexus.create(Engineering);
const started = [...log]; // -> ['reactor online', 'computer self-test at 1.21']
console.log(started);
```

<!-- #endregion on-init -->

<!-- #region dispose-order -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  async [Symbol.asyncDispose]() {
    log.push('reactor scram: control rods dropped');
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
  [Symbol.dispose]() {
    log.push('computer shut down');
  }
}

const ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: QuantumComputer }),
    ],
  }),
);
const first = ship[Symbol.asyncDispose]();
const second = ship[Symbol.asyncDispose]();
const samePromise = first === second; // -> true
console.log(samePromise);
await first;
const stopped = [...log]; // -> ['computer shut down', 'reactor scram: control rods dropped']
console.log(stopped);
```

<!-- #endregion dispose-order -->

<!-- #region dispose-failures -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShieldGrid {
  readonly strength: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  [Symbol.dispose]() {
    throw new Error('control rods jammed');
  }
}
class DeflectorGrid implements IShieldGrid {
  readonly strength = 0.9;
  [Symbol.dispose]() {
    throw new Error('emitters stuck');
  }
}

const ship = await Nexus.create([
  provide(REACTOR, { useClass: FusionReactor }),
  provide(SHIELD_GRID, { useClass: DeflectorGrid }),
]);
const error = await ship[Symbol.asyncDispose]().catch(
  (caught: unknown) => caught,
);
const name = error instanceof Error ? error.name : null; // -> 'SuppressedError'
console.log(name);
const chain = error as { error: Error; suppressed: Error };
const last = chain.error.message; // -> 'control rods jammed'
console.log(last);
const earlier = chain.suppressed.message; // -> 'emitters stuck'
console.log(earlier);
```

<!-- #endregion dispose-failures -->

<!-- #region transient-in-scope -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

const log: string[] = [];
let serial = 0;
class ScoutDrone implements ISurveyDrone {
  readonly serial = ++serial;
  [Symbol.dispose]() {
    log.push(`drone ${this.serial} recalled`);
  }
}

const untracked: string[] = [];
await using ship = await Nexus.create(
  [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  {
    plugins: [
      trace((event) => {
        if (event.type === 'untracked') untracked.push(event.token);
      }),
    ],
  },
);

ship.get(DRONE);
const leaked = [...untracked]; // -> ['SurveyDrone']
console.log(leaked);

{
  await using shuttle = await ship.createScope();
  shuttle.get(DRONE);
}
const recalled = [...log]; // -> ['drone 2 recalled']
console.log(recalled);
```

<!-- #endregion transient-in-scope -->

<!-- #region factory-ownership -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface ISubspaceLink {
  hail(): string;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const BACKUP_LINK = new Token<ISubspaceLink>('BackupLink');

const log: string[] = [];
class SubspaceRelay implements ISubspaceLink {
  constructor(private readonly name: string) {}
  hail() {
    return `${this.name} open`;
  }
  [Symbol.dispose]() {
    log.push(`${this.name} closed`);
  }
}

const backup = new SubspaceRelay('backup relay');
const ship = await Nexus.create([
  provide(SUBSPACE_LINK, { useFactory: () => new SubspaceRelay('main relay') }),
  provide(BACKUP_LINK, { useValue: backup }),
]);
await ship[Symbol.asyncDispose]();
const closed = [...log]; // -> ['main relay closed']
console.log(closed);
```

<!-- #endregion factory-ownership -->
