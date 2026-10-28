import { join } from 'node:path';

import { EdgeVM } from '@edge-runtime/vm';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

interface Counts {
  create: number;
  dispose: number;
  waitUntil: number;
}

let vm: EdgeVM;
const counts = () => vm.evaluate<Counts>('({ ...bridgeCounts })');

// Bundles test/edge/entry.ts to one script and evaluates it in the Edge
// Runtime VM, whose globals are Vercel's Edge Runtime.
beforeAll(async () => {
  const result = await build({
    entryPoints: [join(import.meta.dirname, 'entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'warning',
  });
  vm = new EdgeVM();
  vm.evaluate(result.outputFiles[0]?.text ?? '');
});

describe('the bridge API in the Edge Runtime VM', () => {
  it('runs with the Edge Runtime globals', () => {
    expect(vm.evaluate('typeof EdgeRuntime')).toBe('string');
  });

  it('refuses eval and new Function, as Vercel Edge does', () => {
    // The VM's own EvalError: a class of its realm, so the test matches the text.
    const refused = /Code generation from strings disallowed/;
    expect(() => vm.evaluate("eval('1 + 1')")).toThrow(refused);
    expect(() => vm.evaluate("new Function('return 1')()")).toThrow(refused);
  });

  it('answers a course and disposes its scope through waitUntil', async () => {
    const before = counts();
    const res = await vm.dispatchFetch(
      'https://bridge.test/course/Kepler-442b',
      {
        headers: { 'x-mission-id': 'survey-7' },
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-7: plotting Kepler-442b'],
    });
    await res.waitUntil();
    const after = counts();
    expect(after.create - before.create).toBe(1);
    expect(after.dispose - before.dispose).toBe(1);
    expect(after.waitUntil - before.waitUntil).toBe(1);
  });

  it('answers { id: null } on /mission without scopes', async () => {
    const res = await vm.dispatchFetch('https://bridge.test/mission');
    expect(await res.json()).toEqual({ id: null });
    await res.waitUntil();
  });

  it('creates no scope for a route that resolves nothing', async () => {
    const before = counts();
    const res = await vm.dispatchFetch('https://bridge.test/health');
    expect(await res.text()).toBe('ok');
    await res.waitUntil();
    expect(counts().create).toBe(before.create);
  });
});
