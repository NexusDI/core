# NEXUS_MISSING_DEPS examples

Regions for `apps/docs/content/errors/NEXUS_MISSING_DEPS.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IShipComputer {
  status(): string;
}
interface ISurveyDrone {
  scan(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}
class ScoutDrone implements ISurveyDrone {
  constructor(private readonly computer: IShipComputer) {}
  scan() {
    return `scan with computer ${this.computer.status()}`;
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
  ],
});

const thin = await Nexus.create(Tactical).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_MISSING_DEPS] token=SurveyDrone module=Tactical arity=1 useClass=ScoutDrone. https://nexus.js.org/errors/NEXUS_MISSING_DEPS'
console.log(line);

const full = await Nexus.create(Tactical, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_MISSING_DEPS] ScoutDrone (useClass for SurveyDrone) in Tactical takes 1 constructor parameter and has no deps.', '  Fix: add deps to the binding, declare static deps = [...] as const on ScoutDrone, or decorate it with @Injectable({ deps }).']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IShipComputer {
  status(): string;
}
interface ISurveyDrone {
  scan(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  constructor(private readonly computer: IShipComputer) {}
  scan() {
    return `scan with computer ${this.computer.status()}`;
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
  ],
});

await using ship = await Nexus.create(Tactical);
const scan = ship.get(DRONE).scan(); // -> 'scan with computer online'
console.log(scan);
```

<!-- #endregion fix -->
