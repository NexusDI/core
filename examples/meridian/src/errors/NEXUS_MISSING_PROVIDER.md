# NEXUS_MISSING_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_MISSING_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical],
});

const thin = await Nexus.create(Meridian).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
console.log(line);

const full = await Nexus.create(Meridian, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.', '  NavCharts is provided in Tactical, which does not export it.', "  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering."]
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class StarCharts implements INavCharts {
  plot(to: string) {
    return `course to ${to}`;
  }
}
class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Engineering = defineModule({
  name: 'Engineering',
  imports: [Tactical],
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian);
const course = ship.get(COMPUTER).course('Kepler-442b'); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion fix -->
