# How do I try the 0.4 release candidate? examples

Regions for `apps/docs/content/release-candidate.mdx`. Every block runs as a test.

<!-- #region reproduction -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

// Replace these declarations with the smallest part of your app that fails.
interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
});

const error = await Nexus.create(Engineering).catch(
  (caught: unknown) => caught,
);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_BLUEPRINT_INVALID'
console.log(code);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const messages = inner.map((each) => each.message); // -> ['[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER']
console.log(messages);
```

<!-- #endregion reproduction -->
