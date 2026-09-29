import { describe, expect, it } from 'vitest';

import { classify } from './outcome.ts';

const golden = { singleton: { a: 1 }, transient: { b: 1 }, scoped: { c: 1 } };

describe('classify', () => {
  it('passes a run that matches golden', () => {
    expect(
      classify(
        { singleton: { a: 1 }, transient: { b: 1 }, scoped: { c: 1 } },
        null,
        golden,
      ).outcome,
    ).toBe('pass');
  });
  it('calls a failed build a compile-error', () => {
    expect(
      classify(null, 'TS1219: Experimental support', golden),
    ).toMatchObject({
      outcome: 'compile-error',
      message: 'TS1219: Experimental support',
    });
  });
  it('calls a load failure a compile-error', () => {
    expect(
      classify(
        { load: 'SyntaxError: Invalid or unexpected token' },
        null,
        golden,
      ).outcome,
    ).toBe('compile-error');
  });
  it('takes the worst section, ignoring not-applicable', () => {
    const r = classify(
      {
        singleton: { a: 1 },
        transient: { error: 'Error: x' },
        scoped: 'not-applicable',
      },
      null,
      golden,
    );
    expect(r.sections).toEqual({
      singleton: 'pass',
      transient: 'runtime-error',
      scoped: 'not-applicable',
    });
    expect(r.outcome).toBe('runtime-error');
  });
  it('calls a differing field a wrong-instance', () => {
    expect(
      classify(
        { singleton: { a: 2 }, transient: { b: 1 }, scoped: { c: 1 } },
        null,
        golden,
      ).outcome,
    ).toBe('wrong-instance');
  });
  it('ranks runtime-error above wrong-instance', () => {
    expect(
      classify(
        { singleton: { a: 2 }, transient: { error: 'E' }, scoped: { c: 1 } },
        null,
        golden,
      ).outcome,
    ).toBe('runtime-error');
  });
});
