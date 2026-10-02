# How do I write a NexusDI plugin? examples

Regions for `apps/docs/content/write-a-plugin.mdx`. Every block runs as a test.

<!-- #region observe -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `online at ${this.reactor.output} GW`;
  }
}

// @acme/flight-recorder
function flightRecorder(log: string[]): NexusPlugin {
  return {
    name: 'acme:flight-recorder',
    apiVersion: NEXUS_PLUGIN_API,
    observe(event) {
      if (event.type === 'construct') log.push(`built ${event.token}`);
    },
  };
}

const log: string[] = [];
await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: QuantumComputer }),
    ],
    exports: [COMPUTER],
  }),
  { plugins: [flightRecorder(log)] },
);
const recorded = log; // -> ['built ReactorCore', 'built ShipComputer']
console.log(recorded);
```

<!-- #endregion observe -->

<!-- #region own-error -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, defineModule } from '@nexusdi/core';
import { errorBase, isNexusError, provide } from '@nexusdi/core';
import type { ErrorTextPack, NexusPlugin } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

// @acme/flight-recorder
interface RecorderTargetFields {
  readonly module: string;
}
class RecorderTargetError extends errorBase<
  'ACME_RECORDER_TARGET',
  RecorderTargetFields
>('ACME_RECORDER_TARGET', 'RecorderTargetError', 'https://acme.dev/errors/') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_RECORDER_TARGET: RecorderTargetError;
  }
}

function flightRecorder(options: { module: string }): NexusPlugin {
  return {
    name: 'acme:flight-recorder',
    apiVersion: NEXUS_PLUGIN_API,
    compile: {
      check(view, report) {
        if (!view.modules.some((module) => module.name === options.module))
          report(new RecorderTargetError({ module: options.module }));
      },
    },
  };
}

// @acme/flight-recorder/text
const recorderText = {
  ACME_RECORDER_TARGET: (error) => ({
    message: `the flight recorder watches ${error.module}, which the module graph does not hold.`,
    fix: `import ${error.module}, or pass the name of a module the graph holds.`,
  }),
} satisfies ErrorTextPack;

// The application.
interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

async function messageWith(withText: boolean) {
  const error = await Nexus.create(Engineering, {
    plugins: [
      errors(withText ? { text: [recorderText] } : undefined),
      flightRecorder({ module: 'Tactical' }),
    ],
  }).catch((caught: unknown) => caught);
  return isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
    ? error.errors[0]?.message
    : undefined;
}

const thin = await messageWith(false); // -> '[ACME_RECORDER_TARGET] module=Tactical. https://acme.dev/errors/ACME_RECORDER_TARGET'
console.log(thin);
const full = await messageWith(true);
const lines = full?.split('\n'); // -> ['[ACME_RECORDER_TARGET] the flight recorder watches Tactical, which the module graph does not hold.', '  Fix: import Tactical, or pass the name of a module the graph holds.']
console.log(full);
```

<!-- #endregion own-error -->

<!-- #region own-event -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin, TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

// @acme/flight-recorder
declare module '@nexusdi/core' {
  interface TraceEventByType {
    'acme-recorder/armed': { providers: number };
  }
}

const flightRecorder: NexusPlugin = {
  name: 'acme:flight-recorder',
  apiVersion: NEXUS_PLUGIN_API,
  setup(context) {
    const providers = context.blueprint().providers.length;
    context.emit(() => ({ type: 'acme-recorder/armed', providers }));
  },
};

// The application.
interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const events: TraceEvent[] = [];
await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(REACTOR, { useClass: FusionReactor })],
  }),
  { plugins: [trace((event) => events.push(event)), flightRecorder] },
);
const types = events.map((event) => event.type); // -> ['compile', 'construct', 'acme-recorder/armed']
console.log(types);
```

<!-- #endregion own-event -->

<!-- #region annotate -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { BlueprintView } from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';

// @acme/flight-recorder/devtools: the shape of a GraphAnnotator, with no import from @nexusdi/devtools.
const recorderNotes = (view: BlueprintView) =>
  view.providers
    .filter((provider) => provider.lifetime === 'singleton')
    .map((provider) => ({ provider: provider.id, label: 'recorded' }));

// The application.
interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [provide(REACTOR, { useClass: FusionReactor })],
  }),
  { plugins: [devtools({ annotate: [recorderNotes] })] },
);
const reactor = graph(ship).providers.find(
  (provider) => provider.token === 'ReactorCore',
);
const notes = reactor?.notes; // -> ['recorded']
console.log(notes);
```

<!-- #endregion annotate -->

<!-- #region canonical -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token, defineModule } from '@nexusdi/core';
import { provide } from '@nexusdi/core';
import type { NexusPlugin } from '@nexusdi/core';

interface ISubspaceLink {
  send(message: string): string;
}
// Two copies of one contracts package each make their own token.
const SHELL_LINK = new Token<ISubspaceLink>('comms/SubspaceLink');
const REMOTE_LINK = new Token<ISubspaceLink>('comms/SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  send(message: string) {
    return `relayed ${message}`;
  }
}

const byDescription: NexusPlugin = {
  name: 'acme:by-description',
  apiVersion: NEXUS_PLUGIN_API,
  tokenKey: (token) => (token instanceof Token ? token.description : undefined),
};

let provided = false;
const linkProbe: NexusPlugin = {
  name: 'acme:link-probe',
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    check(view) {
      const link = view.canonical(REMOTE_LINK);
      provided = view.providers.some((provider) => provider.token === link);
    },
  },
};

await using ship = await Nexus.create(
  defineModule({
    name: 'Comms',
    providers: [provide(SHELL_LINK, { useClass: SubspaceRelay })],
    exports: [SHELL_LINK],
  }),
  { plugins: [byDescription, linkProbe] },
);
const seen = provided; // -> true
console.log(seen);
const sent = ship.get(REMOTE_LINK).send('hail'); // -> 'relayed hail'
console.log(sent);
```

<!-- #endregion canonical -->
