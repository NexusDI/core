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
  /** "Module/Provider" label to provider id. */
  readonly providerIds: ReadonlyMap<string, string>;
  /** Module name to module id. */
  readonly moduleIds: ReadonlyMap<string, string>;
} {
  const names = new Map(view.modules.map((m) => [m.id, m.name]));
  const providerIds = new Map<string, string>();
  for (const p of view.providers) {
    const base = `${names.get(p.module)}/${p.name}`;
    let label = base;
    for (let n = 2; providerIds.has(label); n++) label = `${base}#${n}`;
    providerIds.set(label, p.id);
  }
  return {
    providerIds,
    moduleIds: new Map(view.modules.map((m) => [m.name, m.id])),
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
    for (const [label, id] of before.providerIds) {
      expect(after.providerIds.get(label), label).toBe(id);
    }
    expect(after.moduleIds).toEqual(
      new Map([...before.moduleIds, ['Outpost', expect.any(String)]]),
    );
  });

  it('keeps every module and provider id across a load', async () => {
    const { plugin, context } = contextPlugin();
    const ship = await Nexus.create(Meridian, { plugins: [plugin] });
    const first = idsOf(context().blueprint());
    const Annex = defineModule({
      name: 'Annex',
      providers: [provide(SPARE, { useClass: FusionReactor })],
    });
    for (const loaded of [Annex, Outpost]) {
      await ship.load(loaded);
      const now = idsOf(context().blueprint());
      for (const [label, id] of first.providerIds) {
        expect(now.providerIds.get(label), label).toBe(id);
      }
      for (const [name, id] of first.moduleIds) {
        expect(now.moduleIds.get(name), name).toBe(id);
      }
      expect(new Set(now.moduleIds.values()).size).toBe(now.moduleIds.size);
      expect(new Set(now.providerIds.values()).size).toBe(now.providerIds.size);
    }
    const last = idsOf(context().blueprint());
    expect(last.moduleIds.has('Annex')).toBe(true);
    expect(last.providerIds.has('Annex/SpareReactor')).toBe(true);
  });

  it('returns the same view from blueprint() until a load changes the graph', async () => {
    const { plugin, context } = contextPlugin();
    const ship = await Nexus.create(Meridian, { plugins: [plugin] });
    const first = context().blueprint();
    expect(context().blueprint()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    await ship.load(Outpost);
    const second = context().blueprint();
    expect(second).not.toBe(first);
    expect(context().blueprint()).toBe(second);
  });

  it('keeps ids across a load when a compile.module hook returns a fresh replacement with the same providers', async () => {
    let fresh = false;
    const Same = defineModule({
      name: 'Engineering',
      providers: [
        provide(REACTOR, { useClass: FusionReactor }),
        provide(DIAGNOSTICS, { useValue: 'hull' }),
      ],
      exports: [REACTOR, DIAGNOSTICS],
    });
    const { plugin, context } = contextPlugin({
      compile: {
        module: (m: ModuleDefinition) =>
          fresh && m === Engineering ? Same : undefined,
      },
    });
    const ship = await Nexus.create(Meridian, { plugins: [plugin] });
    const before = idsOf(context().blueprint());
    fresh = true;
    await ship.load(Outpost);
    const view = context().blueprint();
    const after = idsOf(view);
    for (const [label, id] of before.providerIds) {
      expect(after.providerIds.get(label), label).toBe(id);
    }
    const engineering = view.modules.find((m) => m.name === 'Engineering');
    expect(engineering?.definition).toBe(Same);
    expect(engineering?.replaced).toBe(Engineering);
  });
});

describe('ordering (G6)', () => {
  it('lists modules, providers and visible() contributions in walk order', async () => {
    const Bay = defineModule({
      name: 'Bay',
      providers: [provide(DIAGNOSTICS, { useValue: 'bay' })],
      exports: [DIAGNOSTICS],
    });
    const Plugged = defineModule({ name: 'Plugged' });
    const Deck = defineModule({
      name: 'Deck',
      providers: [provide(SPARE, { useClass: FusionReactor })],
    });
    const Sub = defineModule({ name: 'Sub' });
    const Hull = defineModule({
      name: 'Engineering',
      imports: [Sub],
      providers: [
        provide(REACTOR, { useClass: FusionReactor }),
        provide(DIAGNOSTICS, { useValue: 'hull' }),
      ],
      exports: [REACTOR, DIAGNOSTICS],
    });
    const Root = defineModule({ name: 'Root', imports: [Hull, Bay] });
    const { plugin, context } = contextPlugin({ modules: [Plugged] });
    const ship = await Nexus.create(Root, { plugins: [plugin] });
    await ship.load(Deck);
    const view = context().blueprint();
    expect(view.modules.map((m) => m.name)).toEqual([
      'Root',
      'Engineering',
      'Sub',
      'Bay',
      'Plugged',
      'Deck',
    ]);
    // Core's own REQUEST record sits in the root module after its listed providers.
    const labels = view.providers
      .filter((p) => p.name !== 'REQUEST')
      .map(
        (p) => `${view.modules.find((m) => m.id === p.module)?.name}/${p.name}`,
      );
    expect(labels).toEqual([
      'Engineering/ReactorCore',
      'Engineering/Diagnostics',
      'Bay/Diagnostics',
      'Deck/SpareReactor',
    ]);
    const diagnostics = view
      .visible(view.root, DIAGNOSTICS)
      .map((id) => view.providers.find((p) => p.id === id)?.module);
    const names = diagnostics.map(
      (id) => view.modules.find((m) => m.id === id)?.name,
    );
    expect(names).toEqual(['Engineering', 'Bay']);
    const scope = await ship.createScope();
    expect(scope.get(DIAGNOSTICS)).toEqual(['hull', 'bay']);
  });

  it('lists a plain token in lookup order from visible()', async () => {
    const Backup = defineModule({
      name: 'Backup',
      providers: [provide(REACTOR, { useClass: FusionReactor })],
      exports: [REACTOR],
    });
    const owners = async (Root: ModuleDefinition): Promise<unknown[]> => {
      const { plugin, context } = contextPlugin();
      await Nexus.create(Root, { plugins: [plugin] });
      const view = context().blueprint();
      return view
        .visible(view.root, REACTOR)
        .map((id) => view.providers.find((p) => p.id === id)?.module)
        .map((id) => view.modules.find((m) => m.id === id)?.name);
    };
    // A module's own provider shadows the ones its imports export.
    expect(
      await owners(
        defineModule({
          name: 'Root',
          imports: [Engineering, Backup],
          providers: [provide(REACTOR, { useClass: FusionReactor })],
        }),
      ),
    ).toEqual(['Root']);
    expect(
      await owners(defineModule({ name: 'Root', imports: [Backup] })),
    ).toEqual(['Backup']);
  });
});
