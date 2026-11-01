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

function moduleView(
  id: string,
  name: string,
  exports: string[] = [],
  imports: string[] = [],
  global = false,
) {
  return {
    id,
    name,
    exports,
    imports,
    global,
  } as Partial<ModuleView> as ModuleView;
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

  it('names a providing module that reaches the requester as an importer, however far', () => {
    const view = {
      modules: [
        moduleView('m0', 'Bridge'),
        moduleView('m1', 'Deck', [], ['m2']),
        moduleView('m2', 'Hull', [], ['m0']),
      ],
      providers: [providerView('p9', NAV_CHARTS, 'm1')],
    } as Partial<BlueprintView> as BlueprintView;
    expect(nearMissesOf({ token: NAV_CHARTS, moduleId: 'm0' }, view)).toEqual([
      { kind: 'importer', module: 'Deck' },
    ]);
  });

  it('terminates on an import cycle among the modules', () => {
    const view = {
      modules: [
        moduleView('m0', 'Bridge', [], ['m1']),
        moduleView('m1', 'Deck', [], ['m2']),
        moduleView('m2', 'Hull', [], ['m1']),
      ],
      providers: [providerView('p9', NAV_CHARTS, 'm2')],
    } as Partial<BlueprintView> as BlueprintView;
    expect(nearMissesOf({ token: NAV_CHARTS, moduleId: 'm0' }, view)).toEqual([
      { kind: 'not-exported', module: 'Hull' },
    ]);
    expect(nearMissesOf({ token: NAV_CHARTS, moduleId: 'm1' }, view)).toEqual([
      { kind: 'importer', module: 'Hull' },
    ]);
  });

  it('reports an importer that exports the token as an importer, not as not-imported', () => {
    const view = {
      modules: [
        moduleView('m0', 'Bridge'),
        moduleView('m1', 'Deck', ['p9'], ['m0']),
      ],
      providers: [providerView('p9', NAV_CHARTS, 'm1')],
    } as Partial<BlueprintView> as BlueprintView;
    expect(nearMissesOf({ token: NAV_CHARTS, moduleId: 'm0' }, view)).toEqual([
      { kind: 'importer', module: 'Deck' },
    ]);
  });

  it('keeps not-exported for a global importer, since exporting the token is the fix', () => {
    const view = {
      modules: [
        moduleView('m0', 'Bridge'),
        moduleView('m1', 'Deck', [], ['m0'], true),
      ],
      providers: [providerView('p9', NAV_CHARTS, 'm1')],
    } as Partial<BlueprintView> as BlueprintView;
    expect(nearMissesOf({ token: NAV_CHARTS, moduleId: 'm0' }, view)).toEqual([
      { kind: 'not-exported', module: 'Deck' },
    ]);
  });

  it("skips core's request provider by its token, whatever its id", () => {
    expect(
      nearMissesOf({ token: REQUEST, moduleId: 'm0' }, viewWith('p9', REQUEST)),
    ).toEqual([]);
  });
});
