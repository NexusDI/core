import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../../errors';
import type { ShipCommand } from '../../simulation/commands';
import { shipText } from '../../text';
import { type IAtmosphereControl, LIFE_SUPPORT_ACTIONS } from './contracts';
import { LifeSupportCommands } from './life-support-commands';

/** A panel that records each call and answers tick 2. */
function build() {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return { tick: 2 };
    };
  const control: IAtmosphereControl = {
    online: record('online'),
    heater: record('heater'),
    scrubber: record('scrubber'),
    oxygen: record('oxygen'),
    vent: record('vent'),
    pump: record('pump'),
  };
  return { calls, commands: new LifeSupportCommands(control) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: LifeSupportCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

describe('LifeSupportCommands', () => {
  it('serves the life-support system', () => {
    expect(build().commands.system).toBe('life-support');
  });

  it.each([
    [{ action: 'online' }, ['online']],
    [
      { action: 'heater', compartment: 'habitat', target: 295 },
      ['heater', 'habitat', { on: undefined, target: 295 }],
    ],
    [
      { action: 'heater', compartment: 'bridge', on: false },
      ['heater', 'bridge', { on: false, target: undefined }],
    ],
    [
      { action: 'heater', compartment: 'bridge', on: true, target: 283 },
      ['heater', 'bridge', { on: true, target: 283 }],
    ],
    [
      { action: 'scrubber', compartment: 'habitat', on: false },
      ['scrubber', 'habitat', false],
    ],
    [
      { action: 'oxygen', compartment: 'bridge', on: true },
      ['oxygen', 'bridge', true],
    ],
    [
      { action: 'vent', compartment: 'airlock', open: true },
      ['vent', 'airlock', true],
    ],
    [
      { action: 'pump', compartment: 'airlock', mode: 'fill' },
      ['pump', 'airlock', 'fill'],
    ],
  ])('hands %o to the panel', (args, call) => {
    const { calls, commands } = build();
    expect(commands.handle({ system: 'life-support', ...args })).toEqual({
      tick: 2,
    });
    expect(calls).toEqual([call]);
  });

  it.each([
    ['a heater with no setting', { action: 'heater', compartment: 'habitat' }],
    ['a heater with no compartment', { action: 'heater', on: true }],
    ['a numeric compartment', { action: 'heater', compartment: 4, on: true }],
    [
      'a target under 283 K',
      { action: 'heater', compartment: 'habitat', target: 282.9 },
    ],
    [
      'a target over 303 K',
      { action: 'heater', compartment: 'habitat', target: 303.1 },
    ],
    [
      'a NaN target',
      { action: 'heater', compartment: 'habitat', target: Number.NaN },
    ],
    [
      'a string target',
      { action: 'heater', compartment: 'habitat', target: '295' },
    ],
    [
      'a string on beside a good target',
      { action: 'heater', compartment: 'habitat', on: 'yes', target: 295 },
    ],
    ['a scrubber with no on', { action: 'scrubber', compartment: 'habitat' }],
    [
      'a string scrubber on',
      { action: 'scrubber', compartment: 'habitat', on: 'true' },
    ],
    ['an oxygen with no compartment', { action: 'oxygen', on: true }],
    ['a vent with no open', { action: 'vent', compartment: 'airlock' }],
    [
      'a vent with on in place of open',
      { action: 'vent', compartment: 'airlock', on: true },
    ],
    ['a pump with no mode', { action: 'pump', compartment: 'airlock' }],
    [
      'a pump mode of drain',
      { action: 'pump', compartment: 'airlock', mode: 'drain' },
    ],
  ])('refuses %s as a bad argument', (_name, args) => {
    const { calls, commands } = build();
    const error = refusal(commands, { system: 'life-support', ...args });
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'argument',
      system: 'life-support',
      action: args.action,
      expected: LIFE_SUPPORT_ACTIONS,
    });
    expect(calls).toEqual([]);
  });

  it.each(['offline', 'constructor', 'toString'])(
    'refuses the unknown action %s',
    (action) => {
      const error = refusal(build().commands, {
        system: 'life-support',
        action,
      });
      expect(error).toBeInstanceOf(BadCommandError);
      expect(error).toMatchObject({ reason: 'action', action });
    },
  );

  it('words the refusal in a sentence of shipText', () => {
    const error = refusal(build().commands, {
      system: 'life-support',
      action: 'offline',
    });
    expect(explain(error as NexusError, { text: [shipText] })?.message).toBe(
      "life-support has no action 'offline'. It takes online with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill.",
    );
  });
});
