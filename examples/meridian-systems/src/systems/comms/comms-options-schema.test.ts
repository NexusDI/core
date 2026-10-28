import { defineModule, Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { Simulation } from '../../simulation/simulation.module';

import { COMMS_OPTIONS_SCHEMA } from './comms-options-schema';
import { Comms } from './comms.module';
import { DEFAULT_COMMS_FREQUENCY } from './contracts';

/** What `Nexus.create` refuses with when `Comms.forRoot(options)` fails its schema. */
async function refusal(options: unknown) {
  return Nexus.create(
    defineModule({
      name: 'Ship',
      imports: [
        Simulation.forRoot({ seed: 7, dt: 0.5 }),
        Comms.forRoot(options as never),
      ],
    }),
  ).then(
    () => undefined,
    (refused: unknown) => refused,
  );
}

const RELAY = { relayUrl: 'https://relay.test' };

describe('the Comms options schema', () => {
  it.each([
    [
      'a frequency that is a string',
      { ...RELAY, frequency: '1420' },
      'frequency',
    ],
    ['a frequency of zero', { ...RELAY, frequency: 0 }, 'frequency'],
    [
      'an infinite frequency',
      { ...RELAY, frequency: Number.POSITIVE_INFINITY },
      'frequency',
    ],
    ['a relayUrl that is a number', { relayUrl: 42 }, 'relayUrl'],
    ['a relayUrl that is not a URL', { relayUrl: 'not a url' }, 'relayUrl'],
    ['a relayUrl on ftp', { relayUrl: 'ftp://relay.test' }, 'relayUrl'],
    ['a missing relayUrl', {}, 'relayUrl'],
    [
      'a fractional relayTimeout',
      { ...RELAY, relayTimeout: 50.5 },
      'relayTimeout',
    ],
    ['a relayTimeout of zero', { ...RELAY, relayTimeout: 0 }, 'relayTimeout'],
    [
      'a relayTimeout above 2 ** 31 - 1',
      { ...RELAY, relayTimeout: 2 ** 31 },
      'relayTimeout',
    ],
    ['the dropped transport key', { ...RELAY, transport: 'relay' }, undefined],
  ])('refuses %s at create', async (_what, options, path) => {
    expect(await refusal(options)).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'CommsOptions',
      cause: {
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'Comms',
        issues: [path === undefined ? {} : { path: [path] }],
      },
    });
  });

  it('names the accepted range of relayTimeout and the value it got', async () => {
    expect(await refusal({ ...RELAY, relayTimeout: 2 ** 31 })).toMatchObject({
      cause: {
        issues: [
          {
            path: ['relayTimeout'],
            message:
              'expected a whole number of ms from 1 to 2,147,483,647, got 2147483648',
          },
        ],
      },
    });
  });

  it('sets the frequency to 1420 when the options leave it out', () => {
    expect(COMMS_OPTIONS_SCHEMA.parse(RELAY)).toEqual({
      ...RELAY,
      frequency: DEFAULT_COMMS_FREQUENCY,
    });
    expect(DEFAULT_COMMS_FREQUENCY).toBe(1420);
  });

  it('lists every refused field', async () => {
    expect(await refusal({ relayUrl: 1, frequency: -1 })).toMatchObject({
      cause: { issues: [{ path: ['frequency'] }, { path: ['relayUrl'] }] },
    });
  });
});
