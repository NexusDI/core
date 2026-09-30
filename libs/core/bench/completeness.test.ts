import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildDispatch } from './build.mjs';

type Core = typeof import('../src/index.js');

const OUT = join(import.meta.dirname, '..', 'tmp', 'bench');
let builds: { on: Core; off: Core };
let text: { on: string; off: string };

beforeAll(async () => {
  const paths = await buildDispatch(OUT);
  builds = { on: await import(paths.on), off: await import(paths.off) };
  text = {
    on: readFileSync(paths.on, 'utf8'),
    off: readFileSync(paths.off, 'utf8'),
  };
}, 60_000);

/**
 * The condition each hook site evaluates, as esbuild prints it. Some sites
 * cost a check without calling a hook (the tracer's clock, the view flags,
 * formatFor and guardAsync), so the spy test below cannot see them. An
 * unguarded site leaves its condition in the `off` bundle.
 */
const SITE_CONDITIONS = [
  'performance.now(',
  '#sinks.length',
  '.formatError.length',
  '.construct.length',
  '.setup.length',
  'hooks.module.length > 0 ||',
  'hooks.check.length',
  '.canon(',
  'await disposePlugins(',
  'input.pluginImports',
  'input.wantsView',
  '.buildHooks ?',
];

function spyPlugin(core: Core) {
  const calls: Record<string, number> = {};
  const hit = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const EXTRA = new core.Token<string>('Extra');
  const Extra = core.defineModule({
    name: 'Extra',
    global: true,
    providers: [core.provide(EXTRA, { useValue: 'x' })],
    exports: [EXTRA],
  });
  const plugin = {
    name: 'spy',
    apiVersion: core.NEXUS_PLUGIN_API,
    modules: [Extra],
    tokenKey: () => void hit('tokenKey'),
    compile: {
      module: () => void hit('compile.module'),
      provider: () => void hit('compile.provider'),
      check: () => void hit('compile.check'),
    },
    construct: () => void hit('construct'),
    observe: () => void hit('observe'),
    formatError: () => {
      hit('formatError');
      return undefined;
    },
    setup: () => void hit('setup'),
    dispose: () => void hit('dispose'),
  };
  return { calls, plugin, EXTRA };
}

async function exercise(core: Core) {
  const { calls, plugin, EXTRA } = spyPlugin(core);
  class Reactor {}
  class Computer {
    static deps = [Reactor] as const;
    constructor(readonly reactor: Reactor) {}
  }
  class Log {}
  const ship = await core.Nexus.create(
    [Reactor, Computer, core.provide(Log, { lifetime: 'scoped' })],
    { plugins: [plugin] },
  );
  ship.get(Computer);
  const extra = ship.has(EXTRA);
  expect(() => ship.get(new core.Token('Missing'))).toThrow();
  // Tokens no lookup has keyed yet, so the canonicalizer asks tokenKey.
  ship.resolve({ unseen: core.optional(new core.Token('Unseen')) });
  expect(() => ship.validate([new core.Token('Unvalidated')])).toThrow();
  const scope = await ship.createScope();
  scope.get(Log);
  await scope[Symbol.asyncDispose]();
  await ship.load(core.defineModule({ name: 'Late', providers: [] }));
  await ship[Symbol.asyncDispose]();
  // A compile error reaches formatThrown from create's own catch.
  await expect(
    core.Nexus.create([Computer], { plugins: [plugin] }),
  ).rejects.toThrow();
  return { calls, extra };
}

describe('the dispatch builds', () => {
  it('leave no hook site condition in the off bundle', () => {
    for (const condition of SITE_CONDITIONS) {
      // Present in `on`, so a renamed site fails here and never passes unseen.
      expect(text.on, condition).toContain(condition);
      expect(text.off, condition).not.toContain(condition);
    }
  });
  it('call every hook with hook sites on', async () => {
    const { calls, extra } = await exercise(builds.on);
    expect(Object.keys(calls).sort()).toEqual(
      [
        'compile.check',
        'compile.module',
        'compile.provider',
        'construct',
        'dispose',
        'formatError',
        'observe',
        'setup',
        'tokenKey',
      ].sort(),
    );
    expect(extra).toBe(true);
  });
  it('call no hook with hook sites compiled out', async () => {
    const { calls, extra } = await exercise(builds.off);
    expect(calls).toEqual({});
    expect(extra).toBe(false);
  });
});
