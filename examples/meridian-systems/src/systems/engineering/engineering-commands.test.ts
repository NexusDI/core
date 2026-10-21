import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError, PowerBudgetError } from '../../errors';
import { FUSION_REACTOR } from '../../physics/thermal';
import type { ShipCommand } from '../../simulation/commands';
import { shipText } from '../../text';
import type { IReactorCore, IShieldGrid } from './contracts';
import { EngineeringCommands } from './engineering-commands';

const EXPECTED =
  'throttle with a level from 0 to 1 and shields with raised true or false';

function build(grid: Partial<IShieldGrid> = {}) {
  const calls: string[] = [];
  const reactor: IReactorCore = {
    output: 0,
    rating: FUSION_REACTOR,
    throttle(level) {
      calls.push(`throttle ${level}`);
      return { tick: 3 };
    },
  };
  const shields: IShieldGrid = {
    draw: () => ({ id: 'shields', priority: 2, demand: 0, heatShare: 0.25 }),
    raise() {
      calls.push('raise');
      return { tick: 4 };
    },
    lower() {
      calls.push('lower');
      return { tick: 5 };
    },
    ...grid,
  };
  return { calls, commands: new EngineeringCommands(reactor, shields) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: EngineeringCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

describe('EngineeringCommands', () => {
  it('serves the engineering system', () => {
    expect(build().commands.system).toBe('engineering');
  });

  it.each([0, 0.5, 1])('queues a throttle of %d on the reactor', (level) => {
    const { calls, commands } = build();
    expect(
      commands.handle({ system: 'engineering', action: 'throttle', level }),
    ).toEqual({ tick: 3 });
    expect(calls).toEqual([`throttle ${level}`]);
  });

  it('raises and lowers the shields', () => {
    const { calls, commands } = build();
    const shields = (raised: boolean) =>
      commands.handle({ system: 'engineering', action: 'shields', raised });
    expect(shields(true)).toEqual({ tick: 4 });
    expect(shields(false)).toEqual({ tick: 5 });
    expect(calls).toEqual(['raise', 'lower']);
  });

  it.each([
    ['a level of 1.5', { action: 'throttle', level: 1.5 }],
    ['a level under 0', { action: 'throttle', level: -0.1 }],
    ['a NaN level', { action: 'throttle', level: Number.NaN }],
    ['a string level', { action: 'throttle', level: '0.5' }],
    ['a missing level', { action: 'throttle' }],
    ['a missing raised', { action: 'shields' }],
    ['a string raised', { action: 'shields', raised: 'true' }],
  ])('refuses %s as a bad argument', (_name, args) => {
    const { calls, commands } = build();
    const error = refusal(commands, { system: 'engineering', ...args });
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'argument',
      system: 'engineering',
      action: args.action,
      expected: EXPECTED,
    });
    expect(calls).toEqual([]);
  });

  it.each(['warp', 'constructor', 'toString'])(
    'refuses the unknown action %s',
    (action) => {
      const error = refusal(build().commands, {
        system: 'engineering',
        action,
      });
      expect(error).toBeInstanceOf(BadCommandError);
      expect(error).toMatchObject({
        reason: 'action',
        system: 'engineering',
        action,
        expected: EXPECTED,
      });
    },
  );

  it('words the refusal in a sentence of shipText', () => {
    const error = refusal(build().commands, {
      system: 'engineering',
      action: 'warp',
    });
    expect(explain(error as NexusError, { text: [shipText] })?.message).toBe(
      `engineering has no action 'warp'. It takes ${EXPECTED}.`,
    );
  });

  it('passes the grid refusal through', () => {
    const refused = new PowerBudgetError({
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
    const { commands } = build({
      raise() {
        throw refused;
      },
    });
    expect(
      refusal(commands, {
        system: 'engineering',
        action: 'shields',
        raised: true,
      }),
    ).toBe(refused);
  });
});
