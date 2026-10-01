import { describe, expect, it } from 'vitest';

import type { ModuleDefinition } from '../src/index.js';
import * as core from '../src/index.js';
import { makeGraph, makeModularGraph } from './graph.mjs';

describe('makeGraph', () => {
  it.each([50, 2000] as const)(
    'builds a valid %i-provider graph',
    async (size) => {
      const { providers, lookups } = makeGraph(core, size);
      expect(providers).toHaveLength(size);
      const ship = await core.Nexus.create(providers as never);
      for (const token of lookups) ship.get(token as never);
      const scope = await ship.createScope();
      await scope[Symbol.asyncDispose]();
      await ship[Symbol.asyncDispose]();
    },
  );
  it('leaves scoped classes out of the lookups', () => {
    const { lookups } = makeGraph(core, 50);
    expect(lookups).toHaveLength(45);
  });
});

describe('makeModularGraph', () => {
  it("builds the tech lead's realistic app: 32 modules, 301 providers", () => {
    const { root: rootUnknown, lookups } = makeModularGraph(core);
    const root = rootUnknown as ModuleDefinition;
    // 1 Config module + 30 feature modules.
    expect(root.imports).toHaveLength(31);
    const features = (root.imports as ModuleDefinition[]).filter(
      (m) => m.name !== 'Config',
    );
    expect(features).toHaveLength(30);
    const providerCount = features.reduce((n, m) => n + m.providers.length, 0);
    expect(providerCount).toBe(300);
    // Config contributes the 301st provider.
    const configModule = (root.imports as ModuleDefinition[]).find(
      (m) => m.name === 'Config',
    );
    expect(configModule?.providers).toHaveLength(1);
    expect(providerCount + (configModule?.providers.length ?? 0)).toBe(301);
    // Config token plus 3 exported tokens per feature.
    expect(lookups).toHaveLength(1 + 30 * 3);
    for (let f = 0; f < 30; f++) {
      expect(features[f].imports).toHaveLength(Math.min(4, f));
      expect(features[f].exports).toHaveLength(3);
    }
  });

  it('creates and resolves every lookup from the root, with no check errors', async () => {
    const { root, lookups } = makeModularGraph(core);
    expect(() => core.Nexus.check(root as never)).not.toThrow();
    const ship = await core.Nexus.create(root as never);
    for (const token of lookups) expect(ship.get(token as never)).toBeDefined();
    await ship[Symbol.asyncDispose]();
  });

  it('accepts a smaller fixture for parameter sanity', async () => {
    const { root, lookups } = makeModularGraph(core, {
      features: 3,
      perFeature: 2,
      exports: 1,
      imports: 2,
    });
    expect(lookups).toHaveLength(1 + 3 * 1);
    const ship = await core.Nexus.create(root as never);
    for (const token of lookups) ship.get(token as never);
    await ship[Symbol.asyncDispose]();
  });
});
