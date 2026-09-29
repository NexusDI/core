import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, '..', 'fixtures');
const golden = JSON.parse(readFileSync(join(FIX, 'golden.json'), 'utf8'));
const scenario = (env: Record<string, string> = {}) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [join(FIX, 'scenario.mjs'), join(FIX, '__test__', 'fake.mjs')],
      { encoding: 'utf8', env: { ...process.env, ...env } },
    ),
  );

describe('scenario.mjs', () => {
  it('prints the golden sections for a correct graph', () => {
    const out = scenario();
    expect(out.singleton).toEqual(golden.singleton);
    expect(out.transient).toEqual(golden.transient);
    expect(out.scoped).toEqual(golden.scoped);
  });
  it('reports a missing dependency as a differing field', () => {
    expect(scenario({ FAKE_BREAK: 'charts' }).singleton.charts).toBe(null);
  });
  it('reports a throwing resolve as an error section', () => {
    expect(scenario({ FAKE_BREAK: 'throw' }).transient).toEqual({
      error: 'Error: drone broke',
    });
  });
  it('prints not-applicable for a lifetime the library lacks', () => {
    expect(scenario({ FAKE_BREAK: 'singletons-only' }).scoped).toBe(
      'not-applicable',
    );
  });
  it('reports a module that fails to load', () => {
    const out = JSON.parse(
      execFileSync(
        process.execPath,
        [join(FIX, 'scenario.mjs'), join(FIX, '__test__', 'missing.mjs')],
        { encoding: 'utf8' },
      ),
    );
    expect(out.load).toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/);
  });
});
