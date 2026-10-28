import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { BadCommandError } from '../../errors';
import type { ShipCommand } from '../../simulation/commands';
import { DOOR_IDS } from '../../simulation/contracts';
import { shipText } from '../../text';

import {
  type IBlastDoors,
  type IFireSuppression,
  SAFETY_ACTIONS,
} from './contracts';
import { refuseSafety, SafetyCommands } from './safety-commands';

/** Panels that record each call and answer tick 2. */
function build() {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return { tick: 2 };
    };
  const doors: IBlastDoors = { open: record('open'), close: record('close') };
  const suppression: IFireSuppression = {
    flood: record('flood'),
    drill: record('drill'),
  };
  return { calls, commands: new SafetyCommands(doors, suppression) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: SafetyCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

describe('SafetyCommands', () => {
  it('serves the safety system', () => {
    expect(build().commands.system).toBe('safety');
  });

  it.each([
    [{ action: 'open', door: 'habitat-airlock' }, ['open', 'habitat-airlock']],
    [{ action: 'close', door: 'airlock-outer' }, ['close', 'airlock-outer']],
    [{ action: 'flood', compartment: 'habitat' }, ['flood', 'habitat']],
    [{ action: 'drill', compartment: 'bridge' }, ['drill', 'bridge']],
    // The panel refuses a door or a room the deck lacks.
    [{ action: 'open', door: 'galley-hatch' }, ['open', 'galley-hatch']],
  ])('hands %o to the panel', (args, call) => {
    const { calls, commands } = build();
    expect(commands.handle({ system: 'safety', ...args })).toEqual({
      tick: 2,
    });
    expect(calls).toEqual([call]);
  });

  it.each([
    ['an open with no door', 'door', { action: 'open' }],
    ['a close with a numeric door', 'door', { action: 'close', door: 3 }],
    [
      'an open with compartment in place of door',
      'door',
      { action: 'open', compartment: 'habitat' },
    ],
    ['a flood with no compartment', 'compartment', { action: 'flood' }],
    [
      'a drill with an array compartment',
      'compartment',
      { action: 'drill', compartment: ['habitat'] },
    ],
    [
      'a flood with door in place of compartment',
      'compartment',
      { action: 'flood', door: 'habitat-airlock' },
    ],
  ])(
    'refuses %s as a bad %s argument before the panel runs',
    (_name, argument, args) => {
      const { calls, commands } = build();
      const error = refusal(commands, { system: 'safety', ...args });
      expect(error).toBeInstanceOf(BadCommandError);
      expect(error).toMatchObject({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'argument',
        system: 'safety',
        action: args.action,
        argument,
        expected: SAFETY_ACTIONS,
      });
      expect(calls).toEqual([]);
    },
  );

  it.each(['vent', 'constructor', 'toString'])(
    'refuses the unknown action %s',
    (action) => {
      const { calls, commands } = build();
      const error = refusal(commands, { system: 'safety', action });
      expect(error).toBeInstanceOf(BadCommandError);
      expect(error).toMatchObject({
        reason: 'action',
        system: 'safety',
        action,
        expected: SAFETY_ACTIONS,
      });
      expect(calls).toEqual([]);
    },
  );

  it('names every door and every charged room in its actions', () => {
    const charged = deck.compartments
      .filter((room) => 'floodCharge' in room)
      .map((room) => room.id);
    const orList = (names: readonly string[]) =>
      `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
    expect(SAFETY_ACTIONS).toBe(
      `open and close with a door of ${orList(DOOR_IDS)}, and flood and drill with a compartment of ${orList(charged)}`,
    );
  });

  it('words the refusal in a sentence of shipText', () => {
    const error = refusal(build().commands, {
      system: 'safety',
      action: 'vent',
    });
    expect(explain(error as NexusError, { text: [shipText] })?.message).toBe(
      "safety has no action 'vent'. It takes open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay.",
    );
  });
});

describe('refuseSafety', () => {
  it('words an unknown action and a bad argument', () => {
    const words = (error: NexusError) =>
      explain(error, { text: [shipText] })?.message;
    expect(words(refuseSafety('vent', 'action'))).toBe(
      `safety has no action 'vent'. It takes ${SAFETY_ACTIONS}.`,
    );
    expect(words(refuseSafety('open', { argument: 'door' }))).toBe(
      `safety open cannot use the door argument. It takes ${SAFETY_ACTIONS}.`,
    );
  });
});
