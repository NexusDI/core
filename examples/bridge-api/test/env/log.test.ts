import { defineModule, isNexusError, Nexus, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { shipLog } from '../../src/env/log';

/** The NexusError a container throws for a token it does not bind. */
async function unbound(): Promise<unknown> {
  await using ship = await Nexus.create(defineModule({ name: 'Empty' }));
  try {
    ship.get(new Token<string>('Absent'));
  } catch (error) {
    return error;
  }
  throw new Error('the container resolved an unbound token');
}

describe('shipLog', () => {
  it('writes the adapter, the phase, the status, the code and the message of a NexusError', async () => {
    const lines: string[] = [];
    const error = await unbound();
    expect(isNexusError(error)).toBe(true);
    shipLog((line) => lines.push(line))(error, {
      adapter: '@nexusdi/hono',
      phase: 'scope',
      status: 500,
    });
    expect(lines).toEqual([
      expect.stringMatching(/^\[@nexusdi\/hono\] scope 500: NEXUS_\w+ /),
    ]);
  });

  it('writes any other error by its message', () => {
    const lines: string[] = [];
    shipLog((line) => lines.push(line))(new Error('disk full'), {
      adapter: '@nexusdi/fastify',
      phase: 'dispose',
    });
    expect(lines).toEqual(['[@nexusdi/fastify] dispose: disk full']);
  });
});
