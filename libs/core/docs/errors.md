# Errors

## One error per compilation

A `BlueprintError` holds every error one compilation found.

<!-- #region errors -->

```ts @import.meta.vitest
import { BlueprintError, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface ISensor {
  readonly range: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const SENSOR = new Token<ISensor>('Sensor');

class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
class LongRangeSensor implements ISensor {
  constructor(readonly range: number) {}
}

let caught: BlueprintError | undefined;
try {
  await Nexus.create(
    defineModule({
      name: 'Broken',
      providers: [
        provide(COMPUTER, { useClass: ShipComputer }),
        provide(SENSOR, { useClass: LongRangeSensor }),
      ],
    }),
  );
} catch (error) {
  caught = error as BlueprintError;
}
caught?.code; // -> 'NEXUS_BLUEPRINT_INVALID'
caught?.errors.map((error) => error.code); // -> ['NEXUS_MISSING_DEPS', 'NEXUS_MISSING_PROVIDER']
```

<!-- #endregion errors -->

## Logging an error

Each error keeps its fields as own enumerable properties, ready for a logger.

<!-- #region error-message -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  readonly charts: INavCharts;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class ShipComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});

const logged: { code: string; message: string }[] = [];
const logger = {
  error(entry: { err: unknown; code: string }, message: string) {
    logged.push({ code: entry.code, message });
  },
};

let message = '';
let fields = {};
try {
  await Nexus.create(Engineering);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
  logger.error({ err: error, code: error.code }, 'startup failed');
  const missing = error.errors[0];
  if (!isNexusError(missing, 'NEXUS_MISSING_PROVIDER')) throw error;
  message = missing.message;
  fields = { ...missing, code: missing.code };
}
message; // -> '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
fields; // -> { token: 'NavCharts', requester: 'ShipComputer', module: 'Engineering', entry: null, nearMisses: [], code: 'NEXUS_MISSING_PROVIDER' }
logged; // -> [{ code: 'NEXUS_BLUEPRINT_INVALID', message: 'startup failed' }]
```

<!-- #endregion error-message -->
