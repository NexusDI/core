import { describe, expect, it } from 'vitest';

import {
  defineModule,
  errorBase,
  MissingDepsError,
  MissingProviderError,
  Nexus,
  provide,
  Token,
  type BlueprintError,
  type BlueprintView,
  type ErrorText,
  type ErrorTextPack,
  type NexusPlugin,
} from '@nexusdi/core';
import { layoutText } from '@nexusdi/core/text';

import { rejected } from '../test-support/catch.js';
import {
  DockingBayError,
  dockingText,
} from '../test-support/third-party-codes.js';
import { errors, explain } from './index.js';

interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
class ShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: NavCharts) {}
}
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useValue: { plot: () => 'x' } })],
});

/** A plugin that hands out the view of the container it is registered in. */
function viewer(): NexusPlugin & { view?: BlueprintView } {
  const plugin: NexusPlugin & { view?: BlueprintView } = {
    name: 'viewer',
    apiVersion: 1,
    setup: (context) => {
      plugin.view = context.blueprint();
    },
  };
  return plugin;
}

describe('explain', () => {
  it('returns the text errors() writes for a BlueprintError and each inner error', async () => {
    const Broken = defineModule({
      name: 'Engineering',
      providers: [ShipComputer, null as never],
    });
    const plain = (await rejected(Nexus.create(Broken))) as BlueprintError;
    const formatted = (await rejected(
      Nexus.create(Broken, { plugins: [errors()] }),
    )) as BlueprintError;
    const text = explain(plain);
    expect(text).toBeDefined();
    expect(layoutText(plain.code, text ?? { message: '' })).toBe(
      formatted.message,
    );
    expect(formatted.message.split('\n')).toHaveLength(4);
  });

  it('finds the near misses of an error core raised, given the view', async () => {
    const plugin = viewer();
    await using ship = await Nexus.create(
      defineModule({ name: 'Meridian', imports: [Tactical] }),
      { plugins: [plugin] },
    );
    const error = (() => {
      try {
        ship.get(new Token<NavCharts>('NavCharts'));
      } catch (caught) {
        return caught as MissingProviderError;
      }
      throw new Error('expected get() to throw');
    })();
    expect(explain(error, { view: plugin.view })).toMatchObject({
      nearMisses: [{ kind: 'same-description', module: 'Tactical' }],
    });
  });

  it('keeps the near misses of an error built without a lookup, given a view', async () => {
    const plugin = viewer();
    await using _ship = await Nexus.create(Tactical, { plugins: [plugin] });
    const error = new MissingProviderError({
      token: 'NavCharts',
      requester: null,
      module: 'Engineering',
      entry: null,
      nearMisses: [{ kind: 'not-imported', module: 'Tactical' }],
    });
    expect(explain(error, { view: plugin.view })?.message).toContain(
      'NavCharts is exported by Tactical, which Engineering does not import.',
    );
  });

  const missingDeps = new MissingDepsError({
    token: 'ShipComputer',
    module: 'Engineering',
    arity: 1,
    useClass: null,
    bare: false,
  });

  /** A pack that words NEXUS_MISSING_DEPS as `message`. */
  const wording = (message: string): ErrorTextPack => ({
    NEXUS_MISSING_DEPS: () => ({ message }),
  });

  it("takes the first pack's text, ahead of later packs and core's pack", () => {
    const text = explain(missingDeps, {
      text: [wording('ShipComputer saknar deps.'), wording('second')],
    });
    expect(text).toEqual({ message: 'ShipComputer saknar deps.' });
  });

  it('falls through a pack entry that returns undefined', () => {
    const silent: ErrorTextPack = { NEXUS_MISSING_DEPS: () => undefined };
    expect(explain(missingDeps, { text: [silent, wording('second')] })).toEqual(
      { message: 'second' },
    );
    expect(explain(missingDeps, { text: [silent] })).toEqual(
      explain(missingDeps),
    );
  });

  it('returns undefined for a code no pack covers', () => {
    const error = new DockingBayError({ bay: 'Shuttle', module: 'Hangar' });
    expect(explain(error)).toBeUndefined();
    expect(explain(error, { text: [wording('unused')] })).toBeUndefined();
  });

  it('never runs an entry a pack inherits', () => {
    type ProtoCode = 'toString' | '__proto__';
    class ProtoError extends errorBase<ProtoCode, { code: ProtoCode }>(
      (fields) => fields.code,
      'ProtoError',
    ) {}
    const inherited = Object.create({
      ACME_DOCKING_BAY: () => ({ message: 'inherited' }),
    }) as ErrorTextPack;
    for (const code of ['toString', '__proto__'] as const) {
      expect(explain(new ProtoError({ code }), { text: [{}] })).toBeUndefined();
    }
    expect(
      explain(new DockingBayError({ bay: 'Shuttle', module: 'Hangar' }), {
        text: [inherited],
      }),
    ).toBeUndefined();
  });

  it('lends a kit whose nearMisses is empty without a view', () => {
    const error = new DockingBayError(
      { bay: 'Shuttle', module: 'Hangar' },
      { hidden: { lookup: { token: NAV_CHARTS, moduleId: 'm0' } } },
    );
    expect(explain(error, { text: [dockingText] })?.nearMisses).toEqual([]);
  });

  it("finds near misses for another package's error through the kit, given the view", async () => {
    const plugin = viewer();
    const Hangar = defineModule({ name: 'Hangar' });
    await using _ship = await Nexus.create(
      defineModule({ name: 'Meridian', imports: [Hangar, Tactical] }),
      { plugins: [plugin] },
    );
    const view = plugin.view as BlueprintView;
    const hangar = view.modules.find((m) => m.name === 'Hangar')?.id;
    const error = new DockingBayError(
      { bay: 'NavCharts', module: 'Hangar' },
      { hidden: { lookup: { token: NAV_CHARTS, moduleId: hangar } } },
    );
    expect(explain(error, { view, text: [dockingText] })).toEqual({
      message: 'Hangar asked for the NavCharts bay, which no module provides.',
      fix: 'provide it: provide(DOCKING_BAY, { useClass: ShuttleBay }).',
      nearMisses: [{ kind: 'not-exported', module: 'Tactical' }],
    });
  });

  it("renders each inner error of a BlueprintError through the caller's packs", async () => {
    const error = (await rejected(
      Nexus.create(
        defineModule({ name: 'Hangar', providers: [ShipComputer] }),
        {
          plugins: [
            {
              name: 'docking',
              apiVersion: 1,
              compile: {
                check: (_view, report) =>
                  report(
                    new DockingBayError({ bay: 'Shuttle', module: 'Hangar' }),
                  ),
              },
            },
          ],
        },
      ),
    )) as BlueprintError;
    const text = explain(error, { text: [dockingText] }) as ErrorText;
    expect(text.message.split('\n')).toEqual([
      'the module graph has 2 errors; nothing was built.',
      '  [NEXUS_MISSING_PROVIDER] ShipComputer (module Hangar) depends on NavCharts, but no provider of NavCharts is visible in Hangar.',
      '      Fix: provide NavCharts in Hangar or in a module Hangar imports.',
      '  [ACME_DOCKING_BAY] Hangar asked for the Shuttle bay, which no module provides.',
      '      Fix: provide it: provide(DOCKING_BAY, { useClass: ShuttleBay }).',
    ]);
  });

  it("lets a pack word a BlueprintError's aggregate", async () => {
    const error = (await rejected(
      Nexus.create(defineModule({ name: 'Hangar', providers: [ShipComputer] })),
    )) as BlueprintError;
    const aggregate: ErrorTextPack = {
      NEXUS_BLUEPRINT_INVALID: (e) => ({ message: `${e.errors.length} fel` }),
    };
    expect(explain(error, { text: [aggregate] })).toEqual({
      message: '1 fel',
    });
  });
});
