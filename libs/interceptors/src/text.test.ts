import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { errorOf, type Fault } from './interceptor-error.js';
import { interceptorsText } from './text.js';

/** The message and fix interceptorsText writes for a fault, joined as core lays them out. */
const render = (fault: Fault): string => {
  const text = explain(errorOf(fault), { text: [interceptorsText] });
  if (text === undefined) throw new Error('no text');
  return text.fix === undefined
    ? text.message
    : `${text.message}\n  Fix: ${text.fix}`;
};

describe('interceptorsText', () => {
  it('writes MISSING with its fix', () => {
    expect(
      render({
        code: 'NEXUS_INTERCEPTOR_MISSING',
        token: 'Audit',
        target: 'Payments',
        method: 'charge',
      }),
    ).toBe(
      'Payments.charge uses the interceptor Audit, which is not registered.\n  Fix: add Audit to interceptors({ register }).',
    );
  });

  it('names a global entry or a binding when MISSING has no target', () => {
    expect(
      render({ code: 'NEXUS_INTERCEPTOR_MISSING', token: 'Audit' }),
    ).toMatch(/^a global entry or binding uses the interceptor Audit/);
    expect(
      render({
        code: 'NEXUS_INTERCEPTOR_MISSING',
        token: 'Audit',
        method: 'charge',
      }),
    ).toMatch(/^a binding for charge uses the interceptor Audit/);
  });

  it('lists every provider an unexempted dep would skip', () => {
    expect(
      render({
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'unexempted-dep',
        token: 'Auth',
        target: 'Users',
        detail: ['Users', 'Db'],
      }),
    ).toBe(
      [
        'Auth depends on Users, which exempt does not list. Exempting it makes global entries skip Users, Db.',
        '  Fix: add Users to interceptors({ exempt }), or move it into providers.',
      ].join('\n'),
    );
  });

  it('writes the option rule an options fault names, and what it received', () => {
    const options = (token: string | null, ...detail: string[]) =>
      render({
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'options',
        token,
        detail,
      });
    expect(options(null, 'exempt-entry', 'Users')).toBe(
      'interceptors(): exempt takes tokens, and received Users.',
    );
    expect(options('Audit', 'register-twice')).toBe(
      'interceptors(): an interceptor is registered twice (Audit).',
    );
    expect(options(null, 'not-array', 'imports')).toBe(
      'interceptors(): imports must be an array.',
    );
    expect(options('Journal', 'binding-map', 'methods.write')).toBe(
      'interceptors(): the binding (Journal) has a methods.write that is not a list of tokens.',
    );
    expect(options('Journal', 'binding-map', 'method')).toBe(
      'interceptors(): the binding (Journal) has the key method, and takes token, class and methods.',
    );
  });

  it.each([
    ['options', { detail: ['register-empty'] }],
    ['options', { detail: ['interceptor-token', 'the string "Audit"'] }],
    ['options', { detail: ['constructor'] }],
    ['declaration', { target: 'Payments', detail: ['methods.charge'] }],
    ['unknown-method', { target: 'Payments', method: 'charge' }],
    ['two-forms', { target: 'Payments' }],
    ['bad-next', { token: 'Audit', target: 'Payments', method: 'charge' }],
    ['unused-exempt', { target: 'Db', detail: ['Users'] }],
    ['unused-exempt', { target: 'Db' }],
    ['self-intercept', { token: 'Log', target: 'Journal' }],
  ] as const)(
    'writes INVALID %s with every field it names',
    (reason, fields) => {
      expect(
        render({ code: 'NEXUS_INTERCEPTOR_INVALID', reason, ...fields }),
      ).not.toMatch(/undefined|null|https:/);
    },
  );

  it('leaves an INVALID reason raised with its own text to that text', () => {
    expect(
      explain(
        errorOf({
          code: 'NEXUS_INTERCEPTOR_INVALID',
          reason: 'legacy-decorators',
        }),
        { text: [interceptorsText] },
      ),
    ).toBeUndefined();
  });

  it.each([
    {
      code: 'NEXUS_INTERCEPTOR_LIFETIME',
      token: 'Audit',
      detail: ['scoped'],
    },
    { code: 'NEXUS_INTERCEPTORS_SHARED' },
  ] satisfies Fault[])('writes $code', (fault) => {
    expect(render(fault)).not.toMatch(/undefined|null|https:/);
  });
});
