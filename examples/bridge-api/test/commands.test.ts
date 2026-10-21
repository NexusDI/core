import { NexusError } from '@nexusdi/core';
import {
  BadCommandError,
  type ICommandDesk,
  PowerBudgetError,
} from '@nexusdi/meridian-systems';
import { describe, expect, it } from 'vitest';

import { answerCommand } from '../src/bridge/commands';

/** A desk whose submit() calls `answer`. */
const desk = (answer: () => { tick: number }): ICommandDesk => ({
  submit: answer,
});

const refuse = (error: unknown) =>
  desk(() => {
    throw error;
  });

describe('answerCommand', () => {
  it('answers 202 with the tick that applies the command', () => {
    expect(answerCommand(desk(() => ({ tick: 4 })), {})).toEqual({
      status: 202,
      body: { tick: 4 },
    });
  });

  it('answers 400 with the bad command text', () => {
    const error = new BadCommandError({
      reason: 'system',
      system: 'warp-core',
      action: 'engage',
      expected: 'engineering',
    });
    expect(answerCommand(refuse(error), {})).toEqual({
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message:
          "No ship system is named 'warp-core'. The desk serves engineering.",
        fix: 'send the command to one of the systems above.',
      },
    });
  });

  it('answers 409 with the power budget text', () => {
    const error = new PowerBudgetError({
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
    expect(answerCommand(refuse(error), {})).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.',
        fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      },
    });
  });

  it('answers 409 with the one-line message for a code no pack words', () => {
    const error = new NexusError('BRIDGE_PROBE', 'ProbeError', {});
    expect(answerCommand(refuse(error), {})).toEqual({
      status: 409,
      body: {
        code: 'BRIDGE_PROBE',
        message: error.message.replace('[BRIDGE_PROBE] ', ''),
      },
    });
  });

  it('rethrows an error that is not a NexusError', () => {
    const bug = new Error('the handler broke');
    expect(() => answerCommand(refuse(bug), {})).toThrow(bug);
  });
});
