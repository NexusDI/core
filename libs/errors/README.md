# @nexusdi/errors

`errors()` gives every NexusDI error its full message, with the fix and the near misses the container found.

```bash
npm install @nexusdi/errors @nexusdi/core
```

The version of `@nexusdi/errors` must equal the version of `@nexusdi/core`.

## Full messages

Core's one-line message names the code and the error's fields, then links to the code's page. Register `errors()`, and core asks it for the text of each error the container raises. `devtools()` from `@nexusdi/devtools` includes it.

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

## Text from other packages

Core's text ships with `errors()`. A package that raises its own codes publishes their text as a pack at its `./text` entry. Pass the packs you use to `errors()`:

```ts
import { errors } from '@nexusdi/errors';
import { federationText } from '@nexusdi/federation/text';

const plugins = [errors({ text: [federationText] })];
```

`errors()` reads your packs in array order, then core's pack, and the first entry that returns text for a code decides. A pack listed earlier overrides a later one for the same code, so a translation of core's text works by listing it first. A code no pack covers keeps the one-line message its package wrote.

## Explaining an error later

`explain(error, { view, text })` returns the full text for an error caught in a container without the plugin, such as one in a log or a test. It reads `text` in the same order `errors()` does. Without the container's `view`, it has no near misses to suggest.

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

`explain()` returns `undefined` for a code no pack covers.

## License

MIT
