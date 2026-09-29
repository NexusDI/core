import { describe, expect, it } from 'vitest';

import {
  InvalidModuleError,
  InvalidProviderError,
  InvalidTokenError,
} from '@nexusdi/core';

import { explain } from './index.js';

describe('explain', () => {
  it('names the second copy of core and the shared fix', () => {
    const text = explain(
      new InvalidModuleError({
        received: 'an object',
        path: ['Shell'],
        otherCopy: true,
      }),
    );
    expect(text?.message).toContain('another copy of @nexusdi/core');
    expect(text?.fix).toContain('shared');
  });

  it('names the second copy for a token and a provider', () => {
    const token = explain(
      new InvalidTokenError({
        received: 'an object',
        entry: null,
        module: 'Shell',
        index: 0,
        reason: null,
        detail: [],
        otherCopy: true,
      }),
    );
    const provider = explain(
      new InvalidProviderError({
        module: 'Shell',
        index: 1,
        reason: 'bad-dep',
        detail: ['deps[0]', 'not-a-token', 'an object'],
        otherCopy: true,
      }),
    );
    expect(token?.message).toBe(
      'an object was made by another copy of @nexusdi/core, which this copy does not recognise (Shell.providers[0]).',
    );
    expect(provider?.message).toBe(
      'an object was made by another copy of @nexusdi/core, which this copy does not recognise (Shell.providers[1], deps[0]).',
    );
    expect(provider?.fix).toContain('singleton: true');
    const factory = explain(
      new InvalidProviderError({
        module: 'Shell',
        index: 2,
        reason: 'bad-dep',
        detail: [
          '(the forRootAsync() factory)',
          'deps[1]',
          'not-a-token',
          'an object',
        ],
        otherCopy: true,
      }),
    );
    expect(factory?.message).toBe(
      'an object was made by another copy of @nexusdi/core, which this copy does not recognise (Shell.providers[2] (the forRootAsync() factory), deps[1]).',
    );
  });

  it('keeps revision 1 text when otherCopy is false', () => {
    const text = explain(
      new InvalidModuleError({
        received: 'an object',
        path: ['Shell'],
        otherCopy: false,
      }),
    );
    expect(text?.message).not.toContain('another copy');
  });
});
