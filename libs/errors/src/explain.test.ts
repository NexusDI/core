import { describe, expect, it } from 'vitest';

import {
  defineModule,
  MissingProviderError,
  Nexus,
  provide,
  Token,
  type BlueprintError,
  type BlueprintView,
  type NexusPlugin,
} from '@nexusdi/core';
import { layoutText } from '@nexusdi/core/text';

import { rejected } from '../test-support/catch.js';
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
    expect(explain(error, plugin.view)).toMatchObject({
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
    expect(explain(error, plugin.view)?.message).toContain(
      'NavCharts is exported by Tactical, which Engineering does not import.',
    );
  });
});
