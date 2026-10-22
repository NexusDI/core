import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../../errors';
import type { ShipCommand } from '../../simulation/commands';
import { shipText } from '../../text';
import { COMMS_ACTIONS, type ICommsArray } from './contracts';
import { CommsCommands } from './comms-commands';

/** An array that counts its hails and answers tick 2. */
function build() {
  const hails: number[] = [];
  const array: ICommsArray = {
    linked: true,
    hail: () => {
      hails.push(2);
      return { tick: 2 };
    },
  };
  return { hails, commands: new CommsCommands(array) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: CommsCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

describe('CommsCommands', () => {
  it('serves the comms system', () => {
    expect(build().commands.system).toBe('comms');
  });

  it('hands a hail to the array', () => {
    const { hails, commands } = build();
    expect(commands.handle({ system: 'comms', action: 'hail' })).toEqual({
      tick: 2,
    });
    expect(hails).toEqual([2]);
  });

  it('ignores the other fields of a hail', () => {
    const { hails, commands } = build();
    expect(
      commands.handle({ system: 'comms', action: 'hail', text: 'hello' }),
    ).toEqual({ tick: 2 });
    expect(hails).toEqual([2]);
  });

  it.each(['send', 'constructor', 'toString'])(
    'refuses the unknown action %s',
    (action) => {
      const { hails, commands } = build();
      const error = refusal(commands, { system: 'comms', action });
      expect(error).toBeInstanceOf(BadCommandError);
      expect(error).toMatchObject({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'action',
        system: 'comms',
        action,
        expected: COMMS_ACTIONS,
      });
      expect(hails).toEqual([]);
    },
  );

  it('words the refusal in a sentence of shipText', () => {
    expect(COMMS_ACTIONS).toBe('hail with no arguments');
    const error = refusal(build().commands, {
      system: 'comms',
      action: 'send',
    });
    expect(explain(error as NexusError, { text: [shipText] })?.message).toBe(
      "comms has no action 'send'. It takes hail with no arguments.",
    );
  });
});
