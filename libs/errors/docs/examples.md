# Error examples

## A provider another module keeps private

`errors()` names the module that provides the token and does not export it.

<!-- #region errors -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  readonly charts: INavCharts;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}
class ShipComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical],
});

let message = '';
try {
  await Nexus.create(Meridian, { plugins: [errors()] });
} catch (error) {
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
  message = error.errors[0]?.message ?? '';
}
message.split('\n'); // -> ["[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.", '  NavCharts is provided in Tactical, which does not export it.', "  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering."]
```

<!-- #endregion errors -->

## Explaining an error later

`explain()` words an error caught in a container without the plugin.

<!-- #region explain -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';

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

let text: string | undefined;
try {
  await Nexus.create(Engineering);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
  const missing = error.errors[0];
  if (missing === undefined) throw error;
  text = explain(missing)?.message;
}
text?.split('\n'); // -> ['ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.', '  Fix: provide NavCharts in Engineering or in a module Engineering imports.']
```

<!-- #endregion explain -->
