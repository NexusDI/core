# Configurable modules examples

Regions for `apps/docs/content/configurable-modules.mdx`. Every block runs as a test.

<!-- #region for-root -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Comms.forRoot({ frequency: 1420, transport: 'relay' })],
});

await using ship = await Nexus.create(Meridian);
const hail = ship.get(SUBSPACE_LINK).hail(); // -> 'relay on 1420'
console.log(hail);
```

<!-- #endregion for-root -->

<!-- #region pick-implementation -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  constructor(private readonly frequency: number) {}
  hail() {
    return `relay on ${this.frequency}`;
  }
}
class LaserLink implements ISubspaceLink {
  constructor(private readonly frequency: number) {}
  hail() {
    return `laser on ${this.frequency}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [
    provide(SUBSPACE_LINK, {
      useFactory: (options): ISubspaceLink =>
        options.transport === 'laser'
          ? new LaserLink(options.frequency)
          : new SubspaceRelay(options.frequency),
      deps: [COMMS_OPTIONS],
    }),
  ],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Comms.forRoot({ frequency: 1420, transport: 'laser' })],
  }),
);
const hail = ship.get(SUBSPACE_LINK).hail(); // -> 'laser on 1420'
console.log(hail);
```

<!-- #endregion pick-implementation -->

<!-- #region for-root-async -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
interface IShipComputer {
  readFrequency(): Promise<number>;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  async readFrequency() {
    return 1701;
  }
}
class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  global: true,
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER],
});
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [
      Engineering,
      Comms.forRootAsync({
        useFactory: async (computer) => ({
          frequency: await computer.readFrequency(),
          transport: 'relay' as const,
        }),
        deps: [COMPUTER],
      }),
    ],
  }),
);
const hail = ship.get(SUBSPACE_LINK).hail(); // -> 'relay on 1701'
console.log(hail);
```

<!-- #endregion for-root-async -->

<!-- #region schema -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import * as v from 'valibot';

const CommsSchema = v.object({
  frequency: v.pipe(v.number(), v.integer(), v.minValue(1)),
  transport: v.picklist(['relay', 'laser']),
});
type CommsOptions = v.InferOutput<typeof CommsSchema>;
interface ISubspaceLink {
  hail(): string;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema: CommsSchema,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

const error = await Nexus.create(
  defineModule({
    name: 'Meridian',
    imports: [Comms.forRoot({ frequency: -5, transport: 'relay' })],
  }),
).catch((caught: unknown) => caught);
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_PROVIDER_FAILED'
console.log(code);
const cause = isNexusError(error) ? error.cause : undefined;
const reason = isNexusError(cause) ? cause.code : null; // -> 'NEXUS_INVALID_MODULE_OPTIONS'
console.log(reason);
const issues = isNexusError(cause, 'NEXUS_INVALID_MODULE_OPTIONS')
  ? cause.issues
  : [];
const messages = issues.map((issue) => issue.message); // -> ['Invalid value: Expected >=1 but received -5']
console.log(messages);
```

<!-- #endregion schema -->

<!-- #region missing-for-root -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

const error = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Comms] }),
).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = inner.map((each) => each.code); // -> ['NEXUS_MODULE_OPTIONS_MISSING']
console.log(codes);
```

<!-- #endregion missing-for-root -->

<!-- #region for-root-once -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
interface INavCharts {
  readonly link: ISubspaceLink;
}
interface IDiagnosticsPanel {
  readonly link: ISubspaceLink;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}
class StarCharts implements INavCharts {
  static deps = [SUBSPACE_LINK] as const;
  constructor(readonly link: ISubspaceLink) {}
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [SUBSPACE_LINK] as const;
  constructor(readonly link: ISubspaceLink) {}
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

// One forRoot() call, imported by both modules: one module instance, one link.
const ShipComms = Comms.forRoot({ frequency: 1420, transport: 'relay' });
const Tactical = defineModule({
  name: 'Tactical',
  imports: [ShipComms],
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Bridge = defineModule({
  name: 'Bridge',
  imports: [ShipComms],
  providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
  exports: [DIAGNOSTICS_PANEL],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Tactical, Bridge] }),
);
const charts = ship.get(NAV_CHARTS);
const panel = ship.get(DIAGNOSTICS_PANEL);
const shared = charts.link === panel.link; // -> true
console.log(shared);
```

<!-- #endregion for-root-once -->

<!-- #region for-root-twice -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}
interface ISubspaceLink {
  hail(): string;
}
interface INavCharts {
  readonly link: ISubspaceLink;
}
interface IDiagnosticsPanel {
  readonly link: ISubspaceLink;
}
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>('DiagnosticsPanel');

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  hail() {
    return `relay on ${this.options.frequency}`;
  }
}
class StarCharts implements INavCharts {
  static deps = [SUBSPACE_LINK] as const;
  constructor(readonly link: ISubspaceLink) {}
}
class StatusBoard implements IDiagnosticsPanel {
  static deps = [SUBSPACE_LINK] as const;
  constructor(readonly link: ISubspaceLink) {}
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

// Two forRoot() calls: two module instances, two links.
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Comms.forRoot({ frequency: 1420, transport: 'relay' })],
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});
const Bridge = defineModule({
  name: 'Bridge',
  imports: [Comms.forRoot({ frequency: 1420, transport: 'relay' })],
  providers: [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })],
  exports: [DIAGNOSTICS_PANEL],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Tactical, Bridge] }),
);
const charts = ship.get(NAV_CHARTS);
const panel = ship.get(DIAGNOSTICS_PANEL);
const shared = charts.link === panel.link; // -> false
console.log(shared);
```

<!-- #endregion for-root-twice -->
