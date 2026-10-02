# NEXUS_BLUEPRINT_INVALID examples

Regions for `apps/docs/content/errors/NEXUS_BLUEPRINT_INVALID.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface ISurveyDrone {
  readonly computer: IShipComputer;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
  }
}
class ScoutDrone implements ISurveyDrone {
  constructor(readonly computer: IShipComputer) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(DRONE, { useClass: ScoutDrone }),
  ],
});

const thin = await Nexus.create(Engineering).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const codes = thin.errors.map((error) => error.code); // -> ['NEXUS_MISSING_DEPS', 'NEXUS_MISSING_PROVIDER']
console.log(codes);
const lines = thin.message.split('\n'); // -> ['[NEXUS_BLUEPRINT_INVALID] 2 errors. https://nexus.js.org/errors/NEXUS_BLUEPRINT_INVALID', '  [NEXUS_MISSING_DEPS] token=SurveyDrone module=Engineering arity=1 useClass=ScoutDrone. https://nexus.js.org/errors/NEXUS_MISSING_DEPS', '  [NEXUS_MISSING_PROVIDER] token=ReactorCore requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER']
console.log(lines);

const full = await Nexus.create(Engineering, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.message.split('\n'); // -> ['[NEXUS_BLUEPRINT_INVALID] the module graph has 2 errors; nothing was built.', '  [NEXUS_MISSING_DEPS] ScoutDrone (useClass for SurveyDrone) in Engineering takes 1 constructor parameter and has no deps.', '      Fix: add deps to the binding, declare static deps = [...] as const on ScoutDrone, or decorate it with @Injectable({ deps }).', '  [NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on ReactorCore, but no provider of ReactorCore is visible in Engineering.', '      Fix: provide ReactorCore in Engineering or in a module Engineering imports.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface ISurveyDrone {
  readonly computer: IShipComputer;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `Reactor output ${this.reactor.output} GW.`;
  }
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  constructor(readonly computer: IShipComputer) {}
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
  ],
});

await using ship = await Nexus.create(Engineering);
const status = ship.get(DRONE).computer.status(); // -> 'Reactor output 1.21 GW.'
console.log(status);
```

<!-- #endregion fix -->
