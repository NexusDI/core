import { isNexusError } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../errors';
import { CommandDesk } from './command-desk';
import type { ICommandHandler, ShipCommand } from './commands';

function handler(system: string, tick = 1) {
  const received: ShipCommand[] = [];
  const double: ICommandHandler = {
    system,
    handle(command) {
      received.push(command);
      return { tick };
    },
  };
  return { double, received };
}

/** What `desk.submit(body)` threw. */
function refusal(desk: CommandDesk, body: unknown): unknown {
  try {
    desk.submit(body);
  } catch (error) {
    return error;
  }
  throw new Error('submit() accepted the body');
}

describe('CommandDesk', () => {
  it('hands a command to the handler of its system and answers with its tick', () => {
    const probe = handler('probe', 4);
    const other = handler('engineering');
    const desk = new CommandDesk([other.double, probe.double]);
    const command = { system: 'probe', action: 'ping' };
    expect(desk.submit(command)).toEqual({ tick: 4 });
    expect(probe.received).toEqual([command]);
    expect(other.received).toEqual([]);
  });

  it('passes the arguments on with the command', () => {
    const probe = handler('probe');
    const desk = new CommandDesk([probe.double]);
    desk.submit({ system: 'probe', action: 'ping', count: 3 });
    expect(probe.received[0]).toEqual({
      system: 'probe',
      action: 'ping',
      count: 3,
    });
  });

  it.each([
    ['null', null, '', ''],
    ['a string', 'ping', '', ''],
    ['an array', ['probe', 'ping'], '', ''],
    ['a body with no system', { action: 'ping' }, '', 'ping'],
    ['a body with no action', { system: 'probe' }, 'probe', ''],
    ['a number system', { system: 7, action: 'ping' }, '', 'ping'],
    ['a number action', { system: 'probe', action: 7 }, 'probe', ''],
  ])('refuses %s as a bad envelope', (_name, body, system, action) => {
    const desk = new CommandDesk([handler('probe').double]);
    const error = refusal(desk, body);
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'envelope',
      system,
      action,
      expected: 'probe',
    });
  });

  it('refuses an unknown system and lists the known ones in name order', () => {
    const desk = new CommandDesk([
      handler('probe').double,
      handler('engineering').double,
      handler('life-support').double,
    ]);
    const error = refusal(desk, { system: 'warp-core', action: 'engage' });
    expect(isNexusError(error, 'MERIDIAN_BAD_COMMAND')).toBe(true);
    expect(error).toMatchObject({
      reason: 'system',
      system: 'warp-core',
      action: 'engage',
      expected: 'engineering, life-support and probe',
    });
  });

  it('serves no system when no module contributes a handler', () => {
    const desk = new CommandDesk([]);
    expect(
      refusal(desk, { system: 'engineering', action: 'throttle' }),
    ).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'system',
      system: 'engineering',
      expected: 'no system',
    });
  });

  it('names a system that is a key of every object as unknown', () => {
    const desk = new CommandDesk([handler('engineering').double]);
    expect(
      refusal(desk, { system: 'constructor', action: 'ping' }),
    ).toMatchObject({ reason: 'system', expected: 'engineering' });
  });

  it('passes a refusal from the handler through', () => {
    const refused = new BadCommandError({
      reason: 'action',
      system: 'probe',
      action: 'warp',
      expected: 'ping',
    });
    const desk = new CommandDesk([
      {
        system: 'probe',
        handle() {
          throw refused;
        },
      },
    ]);
    expect(refusal(desk, { system: 'probe', action: 'warp' })).toBe(refused);
  });

  it('refuses two handlers for one system', () => {
    expect(
      () =>
        new CommandDesk([
          handler('probe').double,
          handler('engineering').double,
          handler('probe').double,
        ]),
    ).toThrow("Two command handlers serve the system 'probe'.");
  });
});
