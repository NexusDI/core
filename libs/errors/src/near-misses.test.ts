import { describe, expect, it } from 'vitest';

import {
  REQUEST,
  Token,
  type BlueprintView,
  type ModuleView,
  type ProviderView,
} from '@nexusdi/core';

import { nearMissesOf } from './near-misses.js';

interface INavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

function moduleView(id: string, name: string, exports: string[] = []) {
  return { id, name, exports } as Partial<ModuleView> as ModuleView;
}

function providerView(id: string, token: unknown, module: string) {
  return { id, token, module } as Partial<ProviderView> as ProviderView;
}

/** A hand-built view: Bridge sees nothing, Deck provides `token` as `id` without exporting it. */
function viewWith(id: string, token: unknown): BlueprintView {
  return {
    modules: [moduleView('m0', 'Bridge'), moduleView('m1', 'Deck')],
    providers: [providerView(id, token, 'm1')],
  } as Partial<BlueprintView> as BlueprintView;
}

describe('nearMissesOf', () => {
  it('names a module that provides the token without exporting it', () => {
    expect(
      nearMissesOf(
        { token: NAV_CHARTS, moduleId: 'm0' },
        viewWith('p9', NAV_CHARTS),
      ),
    ).toEqual([{ kind: 'not-exported', module: 'Deck' }]);
  });

  it("skips core's request provider by its token, whatever its id", () => {
    expect(
      nearMissesOf({ token: REQUEST, moduleId: 'm0' }, viewWith('p9', REQUEST)),
    ).toEqual([]);
  });
});
