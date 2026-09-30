import { describe, expect, it } from 'vitest';

import { errorBase } from '@nexusdi/core';

import { CliError } from './cli-error.js';
import { inspectFailure } from './graph.js';

class CacheStoreError extends errorBase<'ACME_CACHE_STORE', { store: string }>(
  'ACME_CACHE_STORE',
  'CacheStoreError',
) {}

describe('inspectFailure', () => {
  it("exits 2 with the error's message for a third-party NexusError", () => {
    const error = new CacheStoreError(
      { store: 'hold' },
      { text: 'the hold is full.' },
    );
    const failure = inspectFailure(error);
    expect(failure).toBeInstanceOf(CliError);
    expect(failure).toMatchObject({
      exitCode: 2,
      message: '[ACME_CACHE_STORE] the hold is full.',
      fix: null,
    });
  });

  it('leaves an unbranded error with a NEXUS_ code to the caller', () => {
    const error = Object.assign(new Error('look-alike'), {
      code: 'NEXUS_MISSING_PROVIDER',
    });
    expect(inspectFailure(error)).toBeNull();
  });

  it('leaves a plain error to the caller', () => {
    expect(inspectFailure(new Error('reactor breach'))).toBeNull();
    expect(inspectFailure('reactor breach')).toBeNull();
  });
});
