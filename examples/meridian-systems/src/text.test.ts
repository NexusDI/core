import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError, PowerBudgetError } from './errors';
import { ENGINEERING_ACTIONS } from './systems/engineering/engineering-commands';
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
      { system: '', action: '', expected: 'engineering' },
      [
        '[MERIDIAN_BAD_COMMAND] A ship command is an object with a string system and a string action. The desk serves engineering.',
        '  Fix: send { system, action, ...args } as JSON.',
      ],
    ],
    [
      'system',
      { system: 'warp-core', action: 'engage', expected: 'engineering' },
      [
        "[MERIDIAN_BAD_COMMAND] No ship system is named 'warp-core'. The desk serves engineering.",
        '  Fix: send the command to one of the systems above.',
      ],
    ],
    [
      'action',
      { system: 'engineering', action: 'warp', expected: ENGINEERING_ACTIONS },
      [
        "[MERIDIAN_BAD_COMMAND] engineering has no action 'warp'. It takes throttle with a level from 0 to 1 and shields with raised true or false.",
        '  Fix: send one of the actions above with its arguments.',
      ],
    ],
    [
      'argument',
      {
        system: 'engineering',
        action: 'throttle',
        expected: ENGINEERING_ACTIONS,
      },
      [
        '[MERIDIAN_BAD_COMMAND] engineering throttle got an argument it cannot use. It takes throttle with a level from 0 to 1 and shields with raised true or false.',
        '  Fix: send the arguments in the ranges above.',
      ],
    ],
  ] as const)(
    'words MERIDIAN_BAD_COMMAND for a bad %s',
    (reason, fields, lines) => {
      const error = new BadCommandError({ reason, ...fields });
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
});
