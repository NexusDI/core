import { NexusError } from '@nexusdi/core';
import { InterceptorError } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import {
  BadCommandError,
  type ICommandDesk,
  InterlockError,
  PowerBudgetError,
} from '@nexusdi/meridian-systems';
import { shipText } from '@nexusdi/meridian-systems/text';
import { describe, expect, it } from 'vitest';

import { answerCommand } from '../src/bridge/commands';
import { refusalOf, SHIP_TEXT } from '../src/bridge/refusal';

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
    expect(
      answerCommand(
        desk(() => ({ tick: 4 })),
        {},
      ),
    ).toEqual({
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

describe('refusalOf', () => {
  it('reads the ship text and the interceptor text from SHIP_TEXT', () => {
    expect(SHIP_TEXT).toEqual([shipText, interceptorsText]);
  });

  it('words an InterlockError with the difference and the limit', () => {
    const error = new InterlockError({
      door: 'habitat-airlock',
      difference: 70_585,
      limit: 5_000,
    });
    expect(refusalOf(error)).toEqual({
      code: 'MERIDIAN_INTERLOCK',
      message:
        'The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock.',
      fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
    });
  });

  it('words an InterceptorError with the interceptor text', () => {
    const error = new InterceptorError({
      code: 'NEXUS_INTERCEPTOR_LIFETIME',
      reason: null,
      token: 'Audit',
      target: null,
      method: null,
      state: null,
      detail: ['scoped'],
    });
    expect(refusalOf(error)).toEqual({
      code: 'NEXUS_INTERCEPTOR_LIFETIME',
      message:
        'the interceptor Audit is scoped, and interceptors are singletons.',
      fix: 'remove its lifetime, and read request data from call.instance.',
    });
  });
});
