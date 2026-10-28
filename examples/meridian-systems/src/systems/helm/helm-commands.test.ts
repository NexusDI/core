import type { NexusError } from '@nexusdi/core';
import { explain } from '@nexusdi/errors';
import { describe, expect, it } from 'vitest';

import { BadCommandError } from '../../errors';
import type { ShipCommand } from '../../simulation/commands';
import { shipText } from '../../text';

import { HELM_ACTIONS, type IHelm } from './contracts';
import { HelmCommands, refuseHelm } from './helm-commands';

/** A helm that records each course and burn and answers tick 2. */
function build() {
  const calls: string[] = [];
  const helm: IHelm = {
    course: (to) => {
      calls.push(`course ${to}`);
      return { tick: 2 };
    },
    burn: (level) => {
      calls.push(`burn ${level}`);
      return { tick: 2 };
    },
  };
  return { calls, commands: new HelmCommands(helm) };
}

/** What `commands.handle(command)` threw. */
function refusal(commands: HelmCommands, command: ShipCommand): unknown {
  try {
    commands.handle(command);
  } catch (error) {
    return error;
  }
  throw new Error('handle() accepted the command');
}

/** The sentence and the fix shipText give the refusal of `command`. */
function explained(command: ShipCommand) {
  const error = refusal(build().commands, command) as NexusError;
  const text = explain(error, { text: [shipText] });
  return { message: text?.message, fix: text?.fix };
}

describe('HelmCommands', () => {
  it('serves the helm system', () => {
    expect(build().commands.system).toBe('helm');
  });

  it('hands a course to the helm', () => {
    const { calls, commands } = build();
    expect(
      commands.handle({ system: 'helm', action: 'course', to: 'Kepler-442b' }),
    ).toEqual({ tick: 2 });
    expect(calls).toEqual(['course Kepler-442b']);
  });

  it('hands a burn to the helm', () => {
    const { calls, commands } = build();
    expect(
      commands.handle({ system: 'helm', action: 'burn', level: 1 }),
    ).toEqual({ tick: 2 });
    expect(calls).toEqual(['burn 1']);
  });

  it('refuses the unknown action warp', () => {
    const { calls, commands } = build();
    const error = refusal(commands, { system: 'helm', action: 'warp' });
    expect(error).toBeInstanceOf(BadCommandError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_BAD_COMMAND',
      reason: 'action',
      system: 'helm',
      action: 'warp',
      expected: HELM_ACTIONS,
    });
    expect(calls).toEqual([]);
  });

  it.each([-0.1, 1.5, NaN, undefined])(
    'refuses a burn level of %o',
    (level) => {
      const { calls, commands } = build();
      expect(
        refusal(commands, { system: 'helm', action: 'burn', level }),
      ).toMatchObject({
        reason: 'argument',
        system: 'helm',
        action: 'burn',
        argument: 'level',
        expected: HELM_ACTIONS,
      });
      expect(calls).toEqual([]);
    },
  );

  it.each([undefined, 42])('refuses a course to %o', (to) => {
    const { calls, commands } = build();
    expect(
      refusal(commands, { system: 'helm', action: 'course', to }),
    ).toMatchObject({
      reason: 'argument',
      system: 'helm',
      action: 'course',
      argument: 'to',
      expected: HELM_ACTIONS,
    });
    expect(calls).toEqual([]);
  });

  it('words the refusals in sentences of shipText', () => {
    expect(HELM_ACTIONS).toBe(
      'course with a charted star to steer for and burn with a level from 0 to 1',
    );
    expect(explained({ system: 'helm', action: 'warp' })).toEqual({
      message:
        "helm has no action 'warp'. It takes course with a charted star to steer for and burn with a level from 0 to 1.",
      fix: 'send one of the actions above with its arguments.',
    });
    expect(explained({ system: 'helm', action: 'burn', level: 2 })).toEqual({
      message:
        'helm burn cannot use the level argument. It takes course with a charted star to steer for and burn with a level from 0 to 1.',
      fix: 'send the arguments in the ranges above.',
    });
    expect(explained({ system: 'helm', action: 'course', to: 42 })).toEqual({
      message:
        'helm course cannot use the to argument. It takes course with a charted star to steer for and burn with a level from 0 to 1.',
      fix: 'send the arguments in the ranges above.',
    });
  });
});

describe('refuseHelm', () => {
  it('words an unknown action and a bad argument', () => {
    const words = (error: NexusError) =>
      explain(error, { text: [shipText] })?.message;
    expect(words(refuseHelm('warp', 'action'))).toBe(
      `helm has no action 'warp'. It takes ${HELM_ACTIONS}.`,
    );
    expect(words(refuseHelm('course', { argument: 'to' }))).toBe(
      `helm course cannot use the to argument. It takes ${HELM_ACTIONS}.`,
    );
  });
});
