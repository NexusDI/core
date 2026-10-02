# Lifetimes examples

Regions for `apps/docs/content/lifetimes.mdx`. Every block runs as a test.

<!-- #region transient -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IShipComputer {
  readonly serial: number;
}
interface ISurveyDrone {
  readonly serial: number;
  readonly computer: IShipComputer;
}

const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

let computers = 0;
let drones = 0;

class QuantumComputer implements IShipComputer {
  readonly serial = ++computers;
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  readonly serial = ++drones;
  constructor(readonly computer: IShipComputer) {}
}

await using ship = await Nexus.create([
  provide(COMPUTER, { useClass: QuantumComputer }),
  provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
]);

const first = ship.get(DRONE);
const second = ship.get(DRONE);

const serials = [first.serial, second.serial]; // -> [1, 2]
console.log(serials);

const sharedComputer = first.computer === second.computer; // -> true
console.log(sharedComputer);
```

<!-- #endregion transient -->

<!-- #region transient-computer -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface IShipComputer {
  readonly serial: number;
}
interface ISurveyDrone {
  readonly computer: IShipComputer;
}

const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

let computers = 0;

class QuantumComputer implements IShipComputer {
  readonly serial = ++computers;
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  constructor(readonly computer: IShipComputer) {}
}

await using ship = await Nexus.create([
  provide(COMPUTER, { useClass: QuantumComputer, lifetime: 'transient' }),
  provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
]);

const first = ship.get(DRONE);
const second = ship.get(DRONE);

const sharedComputer = first.computer === second.computer; // -> false
console.log(sharedComputer);
```

<!-- #endregion transient-computer -->

<!-- #region eager-false -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface INavCharts {
  plot(target: string): string;
}

const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const log: string[] = [];

class StarCharts implements INavCharts {
  constructor() {
    log.push('charts loaded');
  }
  plot(target: string) {
    return `course to ${target}`;
  }
}

await using ship = await Nexus.create([
  provide(NAV_CHARTS, { useClass: StarCharts, eager: false }),
]);

const beforeGet = [...log]; // -> []
console.log(beforeGet);

const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);

const afterGet = [...log]; // -> ['charts loaded']
console.log(afterGet);
```

<!-- #endregion eager-false -->
