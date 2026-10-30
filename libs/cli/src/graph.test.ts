import { describe, expect, it } from 'vitest';

import { errorBase } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';

import { CliError } from './cli-error.js';
import { inspectFailure, uncheckedWarnings } from './graph.js';

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

  it('exits 1 with the message and stack frames of an error a schema threw', () => {
    const failure = inspectFailure(new Error('reactor breach'));
    expect(failure.exitCode).toBe(1);
    expect(
      failure.message.startsWith(
        'the check threw an error that is not a NexusError, as a forRoot() options schema that throws does: reactor breach\n    at ',
      ),
    ).toBe(true);
    expect(failure.fix).toBe(
      'If a frame points at a schema, return the problem as issues from its validate() so the command names the module. Otherwise report the stack to NexusDI.',
    );
  });

  it('exits 1 with the text of a thrown value that is not an Error', () => {
    expect(inspectFailure('reactor breach')).toMatchObject({
      exitCode: 1,
      message:
        'the check threw an error that is not a NexusError, as a forRoot() options schema that throws does: reactor breach',
    });
  });

  it('classifies an unbranded error with a NEXUS_ code by its brand, not its code', () => {
    const error = Object.assign(new Error('look-alike'), {
      code: 'NEXUS_MISSING_PROVIDER',
    });
    const failure = inspectFailure(error);
    expect(failure.exitCode).toBe(1);
    expect(failure.message.split('\n')[0]).toMatch(/look-alike$/);
  });
});

describe('uncheckedWarnings', () => {
  const graphWith = (unchecked: unknown[]) =>
    ({ modules: [], providers: [], edges: [], unchecked }) as NexusGraph;

  it('words one line for each reason core reports', () => {
    expect(
      uncheckedWarnings(
        graphWith([
          { module: 'Uplink', reason: 'async-schema' },
          { module: 'Comms', reason: 'for-root-async' },
        ]),
      ),
    ).toBe(
      'nexusdi: warning: the options of Uplink are unchecked: its schema is async, so only Nexus.create validates them.\n' +
        'nexusdi: warning: the options of Comms are unchecked: forRootAsync() gives them only at create, so only Nexus.create validates them.\n',
    );
  });

  it('returns an empty string for an empty list', () => {
    expect(uncheckedWarnings(graphWith([]))).toBe('');
  });

  it('words a reason it does not know with the default line', () => {
    expect(
      uncheckedWarnings(
        graphWith([{ module: 'Relay', reason: 'remote-schema' as never }]),
      ),
    ).toBe(
      'nexusdi: warning: the options of Relay are unchecked (reason "remote-schema"), so only Nexus.create validates them.\n',
    );
  });
});
