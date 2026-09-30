import { errorBase } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { explain } from './explain.js';
import { layout } from './layout.js';

type Code =
  | 'NEXUS_INTERCEPTOR_INVALID'
  | 'NEXUS_INTERCEPTOR_MISSING'
  | 'NEXUS_INTERCEPTOR_LIFETIME'
  | 'NEXUS_INTERCEPTOR_NOT_READY'
  | 'NEXUS_INTERCEPTORS_SHARED';

interface Fields {
  readonly code: Code;
  readonly reason: string | null;
  readonly token: string | null;
  readonly target: string | null;
  readonly method: string | null;
  readonly state: 'building' | 'disposed' | null;
  readonly detail: readonly string[];
}

/** InterceptorError's shape, built here so this package keeps no dependency on @nexusdi/interceptors. */
class InterceptorError extends errorBase<Code, Fields>(
  (fields) => fields.code,
  'InterceptorError',
) {}

const make = (code: Code, fields: Partial<Omit<Fields, 'code'>> = {}) =>
  new InterceptorError({
    code,
    reason: null,
    token: null,
    target: null,
    method: null,
    state: null,
    detail: [],
    ...fields,
  });

const render = (error: InterceptorError): string => {
  const text = explain(error);
  if (text === undefined) throw new Error('no text');
  return layout(error.code, text);
};

describe('interceptor texts', () => {
  it('writes MISSING with its fix', () => {
    expect(
      render(
        make('NEXUS_INTERCEPTOR_MISSING', {
          token: 'Audit',
          target: 'Payments',
          method: 'charge',
        }),
      ),
    ).toBe(
      '[NEXUS_INTERCEPTOR_MISSING] Payments.charge uses the interceptor Audit, which is not registered.\n  Fix: add Audit to interceptors({ register }).',
    );
  });

  it('lists every provider an unexempted dep would skip', () => {
    expect(
      render(
        make('NEXUS_INTERCEPTOR_INVALID', {
          reason: 'unexempted-dep',
          token: 'Auth',
          target: 'Users',
          detail: ['Users', 'Db'],
        }),
      ),
    ).toBe(
      [
        '[NEXUS_INTERCEPTOR_INVALID] Auth depends on Users, which exempt does not list. Exempting it makes global entries skip Users, Db.',
        '  Fix: add Users to interceptors({ exempt }), or move it into providers.',
      ].join('\n'),
    );
  });

  it('writes the option rule an options error names, and what it received', () => {
    expect(
      render(
        make('NEXUS_INTERCEPTOR_INVALID', {
          reason: 'options',
          detail: ['exempt-entry', 'Users'],
        }),
      ),
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] interceptors(): exempt takes tokens, and received Users.',
    );
    expect(
      render(
        make('NEXUS_INTERCEPTOR_INVALID', {
          reason: 'options',
          token: 'Audit',
          detail: ['register-twice'],
        }),
      ),
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] interceptors(): an interceptor is registered twice (Audit).',
    );
  });

  it('names the option that must be an array, and a bad binding list', () => {
    expect(
      render(
        make('NEXUS_INTERCEPTOR_INVALID', {
          reason: 'options',
          detail: ['not-array', 'imports'],
        }),
      ),
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] interceptors(): imports must be an array.',
    );
    expect(
      render(
        make('NEXUS_INTERCEPTOR_INVALID', {
          reason: 'options',
          token: 'Journal',
          detail: ['binding-map', 'methods.write'],
        }),
      ),
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] interceptors(): the binding (Journal) has a methods.write that is not a list of tokens.',
    );
  });

  it.each([
    ['options', { detail: ['register-empty'] }],
    ['options', { detail: ['interceptor-token', 'Audit'] }],
    ['options', { token: 'Audit', detail: ['register-twice'] }],
    ['options', { token: 'Payments', detail: ['binding-map', 'method'] }],
    ['options', { token: 'Payments', detail: ['binding-map', 'methods.x'] }],
    ['options', { detail: ['not-array', 'imports'] }],
    ['declaration', { detail: ['Audit'] }],
    ['declaration', { target: 'Payments', detail: ['methods.charge'] }],
    ['unknown-method', { target: 'Payments', method: 'charge' }],
    ['two-forms', { target: 'Payments' }],
    ['private-method', { method: '#charge' }],
    ['static-method', { method: 'charge' }],
    ['bad-target', { target: 'Client', method: 'send' }],
    ['bad-target', { method: 'onInit' }],
    ['bad-target', { detail: ['field'] }],
    ['legacy-decorators', {}],
    ['no-intercept', { token: 'Audit' }],
    ['bad-next', { token: 'Audit', target: 'Payments', method: 'charge' }],
    ['unused-exempt', { target: 'Db', detail: ['Users'] }],
    ['self-intercept', { token: 'Log', target: 'Journal' }],
  ] as const)(
    'writes INVALID %s with every field it names',
    (reason, fields) => {
      const text = render(
        make('NEXUS_INTERCEPTOR_INVALID', { reason, ...fields }),
      );
      expect(text).not.toMatch(/undefined|null|https:/);
    },
  );

  it.each([
    make('NEXUS_INTERCEPTOR_LIFETIME', { token: 'Audit', detail: ['scoped'] }),
    make('NEXUS_INTERCEPTOR_NOT_READY', {
      target: 'Payments',
      method: 'charge',
      state: 'building',
    }),
    make('NEXUS_INTERCEPTOR_NOT_READY', {
      target: 'Payments',
      method: 'charge',
      state: 'disposed',
    }),
    make('NEXUS_INTERCEPTORS_SHARED'),
  ])('writes $code', (error) => {
    expect(render(error)).not.toMatch(/undefined|null|https:/);
  });
});
