import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../../errors';
import { RAILGUN } from '../../physics/weapons';
import type { ShipCommand } from '../../simulation/commands';
import { shipText } from '../../text';
import { type IWeaponMount, WEAPONS_ACTIONS } from './contracts';
import { WeaponsCommands } from './weapons-commands';

/** A mount that records each fire and answers tick 2. */
function build() {
  const calls: number[] = [];
  const mount: IWeaponMount = {
    rating: RAILGUN,
    fire: (range) => {
      calls.push(range);
      return { tick: 2 };
    },
  };
  return { calls, commands: new WeaponsCommands(mount) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: WeaponsCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

describe('WeaponsCommands', () => {
  it('serves the weapons system', () => {
    expect(build().commands.system).toBe('weapons');
  });

  it.each([0, 10_000, 100_000])(
    'hands a fire at %o m to the mount',
    (range) => {
      const { calls, commands } = build();
      expect(
        commands.handle({ system: 'weapons', action: 'fire', range }),
      ).toEqual({ tick: 2 });
      expect(calls).toEqual([range]);
    },
  );

  it('refuses the unknown action reload', () => {
    const { calls, commands } = build();
    const error = refusal(commands, { system: 'weapons', action: 'reload' });
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'action',
      system: 'weapons',
      action: 'reload',
      expected: WEAPONS_ACTIONS,
    });
    expect(calls).toEqual([]);
  });

  it.each([-1, 100_001, NaN, Infinity, '10000', undefined, null])(
    'refuses a fire at a range of %o',
    (range) => {
      const { calls, commands } = build();
      expect(
        refusal(commands, { system: 'weapons', action: 'fire', range }),
      ).toMatchObject({
        reason: 'argument',
        system: 'weapons',
        action: 'fire',
        expected: WEAPONS_ACTIONS,
      });
      expect(calls).toEqual([]);
    },
  );

  it('words the refusals in sentences of shipText', () => {
    expect(WEAPONS_ACTIONS).toBe('fire with a range from 0 to 100,000 m');
    const explained = (command: ShipCommand) => {
      const error = refusal(build().commands, command) as NexusError;
      const text = explain(error, { text: [shipText] });
      return text?.message;
    };
    expect(explained({ system: 'weapons', action: 'reload' })).toBe(
      "weapons has no action 'reload'. It takes fire with a range from 0 to 100,000 m.",
    );
    expect(explained({ system: 'weapons', action: 'fire', range: -1 })).toBe(
      'weapons fire got an argument it cannot use. It takes fire with a range from 0 to 100,000 m.',
    );
  });
});
