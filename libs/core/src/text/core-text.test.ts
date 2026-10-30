import { describe, expect, it } from 'vitest';

import type { BlueprintView, ErrorTextKit, NearMiss } from '../index.js';
import {
  CircularDependencyError,
  CoreNotSharedError,
  LoadGrantError,
  MissingProviderError,
  PluginError,
  Token,
} from '../index.js';
import { coreText } from '../text/index.js';

interface INavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const KIT_MISS: NearMiss = { kind: 'not-imported', module: 'Tactical' };

/** A kit that records each lookup and answers with one near miss. */
function kit(calls: unknown[][] = []): ErrorTextKit {
  return {
    nearMisses: (token, moduleId) => {
      calls.push([token, moduleId]);
      return [KIT_MISS];
    },
  };
}

// The pack reads the view only to learn that one exists; the kit does the search.
const view = {} as BlueprintView;

function missingProvider(nearMisses: readonly NearMiss[] = []) {
  return new MissingProviderError(
    {
      token: 'NavCharts',
      requester: null,
      module: 'Meridian',
      entry: null,
      nearMisses,
    },
    { hidden: { lookup: { token: NAV_CHARTS, moduleId: 'm1' } } },
  );
}

describe('coreText', () => {
  it('asks the kit for the near misses of a core lookup, given a view', () => {
    const calls: unknown[][] = [];
    const text = coreText.NEXUS_MISSING_PROVIDER(
      missingProvider(),
      view,
      kit(calls),
    );
    expect(calls).toEqual([[NAV_CHARTS, 'm1']]);
    expect(text.nearMisses).toEqual([KIT_MISS]);
    expect(text.message).toContain(
      'NavCharts is exported by Tactical, which Meridian does not import.',
    );
  });

  it("returns the error's own near misses without a view", () => {
    const own: NearMiss = { kind: 'not-exported', module: 'Science' };
    const calls: unknown[][] = [];
    const text = coreText.NEXUS_MISSING_PROVIDER(
      missingProvider([own]),
      undefined,
      kit(calls),
    );
    expect(calls).toEqual([]);
    expect(text.nearMisses).toEqual([own]);
    expect(text.message).toContain(
      'NavCharts is provided in Science, which does not export it.',
    );
  });

  it("returns the error's own near misses for an error built without a lookup, given a view", () => {
    const own: NearMiss = { kind: 'not-imported', module: 'Science' };
    const calls: unknown[][] = [];
    const text = coreText.NEXUS_MISSING_PROVIDER(
      new MissingProviderError({
        token: 'NavCharts',
        requester: null,
        module: 'Meridian',
        entry: null,
        nearMisses: [own],
      }),
      view,
      kit(calls),
    );
    expect(calls).toEqual([]);
    expect(text.nearMisses).toEqual([own]);
    expect(text.message).toContain(
      'NavCharts is exported by Science, which Meridian does not import.',
    );
  });

  it('names the second copy of core for a value another copy made', () => {
    const text = coreText.NEXUS_CORE_NOT_SHARED(
      new CoreNotSharedError({
        received: 'the module Cartography',
        where: 'load()',
      }),
    );
    expect(text.message).toBe(
      'the module Cartography was made by another copy of @nexusdi/core (load()).',
    );
    expect(text.fix).toBe(
      'load one copy of @nexusdi/core. Check that npm installed it once (npm ls @nexusdi/core), that no test calls vi.resetModules() between the module and the container that reads it, and that no bundler resolves the @nexusdi/source condition for one import and dist for another. In Module Federation, share @nexusdi/core with singleton: true.',
    );
  });

  it('words already-loaded so it holds for a module with no recorded grant and for a subset', () => {
    const text = coreText.NEXUS_LOAD_GRANT(
      new LoadGrantError({
        module: 'Science',
        grant: 'Reactors',
        reason: 'already-loaded',
      }),
    );
    expect(text.message).toContain(
      'Science is already in the graph with its grant fixed',
    );
    expect(text.message).toContain('another set of grants');
    expect(text.message).toContain('Reactors');
    expect(text.message).not.toContain('differs from the grant');
  });

  it('leaves the place out of the message when core met the value at none', () => {
    const text = coreText.NEXUS_CORE_NOT_SHARED(
      new CoreNotSharedError({ received: 'a provider', where: null }),
    );
    expect(text.message).toBe(
      'a provider was made by another copy of @nexusdi/core.',
    );
  });
});

describe('NEXUS_CIRCULAR_DEPENDENCY text', () => {
  const message = (
    path: string[],
    kinds?: CircularDependencyError['kinds'][number][],
  ): string =>
    coreText.NEXUS_CIRCULAR_DEPENDENCY(
      new CircularDependencyError({ path, kinds } as never),
    ).message;

  it('wraps the first step in lazy() for a required step', () => {
    expect(
      message(
        ['ShieldGrid', 'PowerRouter', 'ShieldGrid'],
        ['required', 'required'],
      ),
    ).toMatch(
      /the dependency of ShieldGrid on PowerRouter: lazy\(PowerRouter\)\.$/,
    );
  });

  it('wraps an all() step in lazy(all())', () => {
    expect(
      message(
        ['PowerRouter', 'PowerConsumer', 'PowerRouter'],
        ['all', 'required'],
      ),
    ).toMatch(
      /the dependency of PowerRouter on PowerConsumer: lazy\(all\(PowerConsumer\)\)\.$/,
    );
  });

  it('names the first step that is not an alias', () => {
    expect(
      message(['A', 'B', 'C', 'A'], ['alias', 'required', 'required']),
    ).toMatch(/the dependency of B on C: lazy\(C\)\.$/);
  });

  it('says no lazy() breaks a cycle of aliases', () => {
    const text = message(['A', 'B', 'A'], ['alias', 'alias']);
    expect(text).toContain('lazy() cannot wrap an alias');
    expect(text).not.toContain('lazy(B)');
  });

  it('keeps the rc.2 fix line for an error with no kinds', () => {
    expect(message(['ShieldGrid', 'PowerRouter', 'ShieldGrid'])).toMatch(
      /lazy\(PowerRouter\)\.$/,
    );
  });
});

describe('NEXUS_PLUGIN_VERSION text', () => {
  const line = (apiVersion: string, supported: readonly number[] = [1, 2]) =>
    coreText.NEXUS_PLUGIN_VERSION(
      new PluginError({
        code: 'NEXUS_PLUGIN_VERSION',
        plugin: 'devtools',
        apiVersion,
        supported,
      } as never),
    ).message;

  it('tells the user to upgrade core when the plugin is above every supported version', () => {
    expect(line('3')).toBe(
      'devtools was written for plugin API 3; this @nexusdi/core supports 1, 2.\n  Fix: install a @nexusdi/core that supports plugin API 3.',
    );
  });

  it('tells the user to upgrade the plugin when the version is below the top one', () => {
    expect(line('0')).toContain(
      'Fix: install the plugin version built for this @nexusdi/core.',
    );
  });

  it('tells the user to upgrade the plugin when the version sits between supported ones', () => {
    expect(line('2', [1, 3])).toContain(
      'Fix: install the plugin version built for this @nexusdi/core.',
    );
  });

  it('tells the user to upgrade the plugin when the version is not a number', () => {
    for (const value of ['undefined', 'the string "9"', 'null']) {
      expect(line(value)).toContain(
        'Fix: install the plugin version built for this @nexusdi/core.',
      );
    }
  });
});
