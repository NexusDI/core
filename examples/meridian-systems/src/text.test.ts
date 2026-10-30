import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import {
  BadCommandError,
  FtlNotSpooledError,
  InterlockError,
  PowerBudgetError,
  RelayError,
  UnchartedStarError,
  UnknownCompartmentError,
} from './errors';
import { ENGINEERING_ACTIONS } from './systems/engineering/contracts';
import { formatNumber, shipText } from './text';

/** The text shipText gives `error`, laid out as core prints it. */
function render(error: NexusError): string {
  const text = explain(error, { text: [shipText] });
  if (text === undefined) throw new Error(`no text for ${error.code}`);
  return [
    `[${error.code}] ${text.message}`,
    ...(text.fix === undefined ? [] : [`  Fix: ${text.fix}`]),
  ].join('\n');
}

describe('formatNumber', () => {
  it.each([
    [193_600_000 / 1e6, 1, '193.6'],
    [98_410, 0, '98,410'],
    [1_234_567.89, 2, '1,234,567.89'],
    [200, 1, '200'],
    [1_000, 0, '1,000'],
    [999.96, 1, '1,000'],
    [-1_234.5, 0, '-1,235'],
    [-0.04, 1, '0'],
    [0.5, 3, '0.5'],
  ])('writes %d to %d digits as %s', (value, digits, expected) => {
    expect(formatNumber(value, digits)).toBe(expected);
  });
});

describe('shipText', () => {
  it('words MERIDIAN_POWER_BUDGET in megawatts', () => {
    const error = new PowerBudgetError({
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
    expect(render(error)).toBe(
      [
        '[MERIDIAN_POWER_BUDGET] The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.',
        '  Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      ].join('\n'),
    );
  });

  it.each([
    [
      'envelope',
      {
        reason: 'envelope',
        system: '',
        action: '',
        expected: 'engineering',
      },
      [
        '[MERIDIAN_BAD_COMMAND] A ship command is an object with a string system and a string action. The desk serves engineering.',
        '  Fix: send { system, action, ...args } as JSON.',
      ],
    ],
    [
      'system',
      {
        reason: 'system',
        system: 'warp-core',
        action: 'engage',
        expected: 'engineering',
      },
      [
        "[MERIDIAN_BAD_COMMAND] No ship system is named 'warp-core'. The desk serves engineering.",
        '  Fix: send the command to one of the systems above.',
      ],
    ],
    [
      'action',
      {
        reason: 'action',
        system: 'engineering',
        action: 'warp',
        expected: ENGINEERING_ACTIONS,
      },
      [
        "[MERIDIAN_BAD_COMMAND] engineering has no action 'warp'. It takes throttle with a level from 0 to 1 and shields with raised true or false.",
        '  Fix: send one of the actions above with its arguments.',
      ],
    ],
    [
      'unusable argument',
      {
        reason: 'argument',
        system: 'engineering',
        action: 'throttle',
        argument: 'level',
        problem: 'invalid',
        expected: ENGINEERING_ACTIONS,
      },
      [
        '[MERIDIAN_BAD_COMMAND] engineering throttle cannot use the level argument. It takes throttle with a level from 0 to 1 and shields with raised true or false.',
        '  Fix: send the arguments in the ranges above.',
      ],
    ],
    [
      'missing argument',
      {
        reason: 'argument',
        system: 'engineering',
        action: 'throttle',
        argument: 'level',
        problem: 'missing',
        expected: ENGINEERING_ACTIONS,
      },
      [
        '[MERIDIAN_BAD_COMMAND] engineering throttle needs the level argument. It takes throttle with a level from 0 to 1 and shields with raised true or false.',
        '  Fix: send the arguments in the ranges above.',
      ],
    ],
  ] as const)(
    'words MERIDIAN_BAD_COMMAND for a bad %s',
    (_name, fields, lines) => {
      const error = new BadCommandError(fields);
      expect(render(error)).toBe(lines.join('\n'));
    },
  );

  it('leaves a MERIDIAN_BAD_COMMAND of an unknown reason to the one-line message', () => {
    const error = new BadCommandError({
      reason: 'drift' as 'action',
      system: 'engineering',
      action: 'warp',
      expected: ENGINEERING_ACTIONS,
    });
    expect(explain(error, { text: [shipText] })).toBeUndefined();
  });

  it('words MERIDIAN_UNKNOWN_COMPARTMENT for an id the deck does not have', () => {
    const error = new UnknownCompartmentError({
      compartment: 'galley',
      expected: 'bridge, habitat, reactor-bay and airlock',
    });
    expect(render(error)).toBe(
      [
        "[MERIDIAN_UNKNOWN_COMPARTMENT] No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock.",
        '  Fix: read /compartments/<id>/atmosphere with one of the compartments above.',
      ].join('\n'),
    );
  });

  it('shows at most 32 characters of a long compartment id', () => {
    const error = new UnknownCompartmentError({
      compartment: 'x'.repeat(5_000),
      expected: 'bridge, habitat, reactor-bay and airlock',
    });
    expect(explain(error, { text: [shipText] })?.message).toBe(
      `No compartment is named '${'x'.repeat(32)}...'. The deck has bridge, habitat, reactor-bay and airlock.`,
    );
  });

  it('words MERIDIAN_UNKNOWN_COMPARTMENT for a request that names none', () => {
    const error = new UnknownCompartmentError({
      expected: 'bridge, habitat, reactor-bay and airlock',
    });
    expect(render(error)).toBe(
      [
        '[MERIDIAN_UNKNOWN_COMPARTMENT] The request names no compartment. The deck has bridge, habitat, reactor-bay and airlock.',
        '  Fix: read /compartments/<id>/atmosphere with one of the compartments above.',
      ].join('\n'),
    );
  });

  it('words MERIDIAN_INTERLOCK with the difference and the limit', () => {
    const error = new InterlockError({
      door: 'habitat-airlock',
      difference: 70_585,
      limit: 5_000,
    });
    expect(render(error)).toBe(
      [
        '[MERIDIAN_INTERLOCK] The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock.',
        '  Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
      ].join('\n'),
    );
  });

  it.each([
    [22.5e9, 'The FTL drive holds 22.5 GJ of the 90 GJ a jump needs.'],
    [0, 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.'],
  ])(
    'words MERIDIAN_FTL_NOT_SPOOLED at a charge of %d J',
    (charge, message) => {
      expect(render(new FtlNotSpooledError({ charge, energy: 90e9 }))).toBe(
        [
          `[MERIDIAN_FTL_NOT_SPOOLED] ${message}`,
          '  Fix: spool the drive and wait until it holds the full charge, then jump.',
        ].join('\n'),
      );
    },
  );
});

describe('MERIDIAN_RELAY', () => {
  it('words a relay that gave no answer in time', () => {
    const error = new RelayError({
      channel: 'charts',
      reason: 'timeout',
      expected: 'within 5,000 ms',
    });
    expect(render(error)).toBe(
      [
        '[MERIDIAN_RELAY] The subspace relay did not answer the charts channel within 5,000 ms.',
        '  Fix: check that the relay is up and reachable at relayUrl, or raise relayTimeout.',
      ].join('\n'),
    );
  });

  it('words a relay that answered a table the ship cannot read', () => {
    const error = new RelayError({
      channel: 'charts',
      reason: 'malformed',
      expected: 'a JSON object that maps each star name to a finite heading',
    });
    expect(render(error)).toBe(
      [
        '[MERIDIAN_RELAY] The subspace relay answered the charts channel with a table the ship cannot read. The table must be a JSON object that maps each star name to a finite heading.',
        '  Fix: check what the relay serves on that channel.',
      ].join('\n'),
    );
  });
});

describe('MERIDIAN_UNCHARTED', () => {
  it('words a star the charts do not hold and lists the charted ones', () => {
    const error = new UnchartedStarError({
      star: 'Vega',
      charted: ['Kepler-442b', 'Proxima-b', 'TRAPPIST-1e'],
    });
    expect(render(error)).toBe(
      [
        "[MERIDIAN_UNCHARTED] No star is charted as 'Vega'.",
        '  Fix: plot a course to a charted star: Kepler-442b, Proxima-b, TRAPPIST-1e.',
      ].join('\n'),
    );
  });

  it('cuts a long star name from a request path', () => {
    const error = new UnchartedStarError({ star: 'x'.repeat(40), charted: [] });
    expect(render(error)).toContain(`'${'x'.repeat(32)}...'`);
  });
});
