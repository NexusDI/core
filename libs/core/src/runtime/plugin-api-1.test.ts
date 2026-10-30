import { describe, expect, it } from 'vitest';

import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { ModuleDefinition } from '../definitions/define-module.js';
import type { NexusPlugin, PluginContext } from './plugins.js';

interface IReactorCore {
  readonly output: number;
}
interface ISensorArray {
  readonly range: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const SENSORS = new Token<ISensorArray>('SensorArray');
const SCANNER = new Token<ISensorArray>('Scanner');
const SPARE = new Token<IReactorCore>('SpareReactor');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class LongRangeSensors implements ISensorArray {
  readonly range = 9000;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(DIAGNOSTICS, { useValue: 'hull' }),
  ],
  exports: [REACTOR, DIAGNOSTICS],
});
const Science = defineModule({
  name: 'Science',
  providers: [
    provide(SENSORS, { useClass: LongRangeSensors }),
    provide(SCANNER, { useClass: LongRangeSensors }),
  ],
  exports: [SENSORS, SCANNER],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Science],
});
const Outpost = defineModule({ name: 'Outpost' });

/** "Module/Provider" label to provider id, plus module name to module id. */
function idsOf(view: BlueprintView): {
  readonly providers: ReadonlyMap<string, string>;
  readonly modules: ReadonlyMap<string, string>;
} {
  const names = new Map(view.modules.map((m) => [m.id, m.name]));
  const providers = new Map<string, string>();
  for (const p of view.providers) {
    const base = `${names.get(p.module)}/${p.name}`;
    let label = base;
    for (let n = 2; providers.has(label); n++) label = `${base}#${n}`;
    providers.set(label, p.id);
  }
  return {
    providers,
    modules: new Map(view.modules.map((m) => [m.name, m.id])),
  };
}

function contextPlugin(extra: Partial<NexusPlugin> = {}): {
  readonly plugin: NexusPlugin;
  readonly context: () => PluginContext;
} {
  let held: PluginContext | undefined;
  return {
    plugin: {
      name: 'test:plugin-api-1',
      apiVersion: 1,
      setup: (c) => {
        held = c;
      },
      ...extra,
    },
    context: () => {
      if (held === undefined) throw new Error('setup did not run');
      return held;
    },
  };
}

describe('identity across a load (G5)', () => {
  it('keeps ids when a compile.module hook adds providers to a module at a load', async () => {
    // Probe (Q5). Engineering gains a provider only from the load on, so
    // every record walked after it would shift a p<n> index if ids came
    // from walk order alone.
    let grown = false;
    const Grown = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, { useClass: FusionReactor }),
        provide(DIAGNOSTICS, { useValue: 'hull' }),
        provide(SPARE, { useClass: FusionReactor }),
      ],
      exports: [REACTOR, DIAGNOSTICS, SPARE],
    });
    const { plugin, context } = contextPlugin({
      compile: {
        module: (m: ModuleDefinition) =>
          grown && m === Engineering ? Grown : undefined,
      },
    });
    const ship = await Nexus.create(Meridian, { plugins: [plugin] });
    const before = idsOf(context().blueprint());
    grown = true;
    await ship.load(Outpost);
    const after = idsOf(context().blueprint());
    const scope = await ship.createScope();
    expect(scope.get(SPARE)).toHaveProperty('output');
    for (const [label, id] of before.providers) {
      expect(after.providers.get(label), label).toBe(id);
    }
    expect(after.modules).toEqual(
      new Map([...before.modules, ['Outpost', expect.any(String)]]),
    );
  });
});
