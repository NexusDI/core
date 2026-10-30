import { NexusError } from '@nexusdi/core';
import { InterceptorError } from '@nexusdi/interceptors';
import { interceptorsText } from '@nexusdi/interceptors/text';
import {
  BadCommandError,
  type ICommandDesk,
  InterlockError,
  PowerBudgetError,
  RelayError,
} from '@nexusdi/meridian-systems';
import {
  NO_SUBSPACE_LINK_NOTICE,
  shipText,
} from '@nexusdi/meridian-systems/text';
import { describe, expect, it } from 'vitest';

import { answerCommand } from '../src/bridge/commands';
import { RELAY_FIX, relayText } from '../src/bridge/relay-text';
import { refusalOf, SHIP_TEXT } from '../src/bridge/refusal';
import { systemPhaseText } from '../src/ship/black-box.plugin';
import { FakeFlightLog } from './doubles';

/** A desk whose submit() calls `answer`. */
const desk = (
  answer: () => { tick: number; notice?: { code: string; message: string } },
): Pick<ICommandDesk, 'submit'> => ({
  submit: answer,
});

const refuse = (error: unknown) =>
  desk(() => {
    throw error;
  });

describe('answerCommand', () => {
  it('answers the notice of an accepted command with the fix from the bridge table', () => {
    const hailed = desk(() => ({ tick: 1, notice: NO_SUBSPACE_LINK_NOTICE }));
    expect(answerCommand(hailed, {}, new FakeFlightLog())).toEqual({
      status: 202,
      body: {
        tick: 1,
        notice: {
          code: 'MERIDIAN_NO_SUBSPACE_LINK',
          message:
            'The ship binds no SUBSPACE_LINK, so the hail waits under "no subspace link".',
          fix: 'Start the relay with `npx nx run @nexusdi/bridge-api:dev-relay` and set RELAY_URL to its address, or run `npx nx run @nexusdi/bridge-api:dev`, which starts both.',
        },
      },
    });
  });

  it('answers a notice with a code the table does not hold without a fix', () => {
    const noted = desk(() => ({
      tick: 2,
      notice: { code: 'OTHER', message: 'Something to know.' },
    }));
    expect(answerCommand(noted, {}, new FakeFlightLog())).toEqual({
      status: 202,
      body: {
        tick: 2,
        notice: { code: 'OTHER', message: 'Something to know.' },
      },
    });
  });

  it('answers 202 with the tick that applies the command', () => {
    expect(
      answerCommand(
        desk(() => ({ tick: 4 })),
        {},
        new FakeFlightLog(),
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
    expect(answerCommand(refuse(error), {}, new FakeFlightLog())).toEqual({
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
      throttle: 0,
      ahead: [],
      climbing: false,
    });
    expect(answerCommand(refuse(error), {}, new FakeFlightLog())).toEqual({
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
    expect(answerCommand(refuse(error), {}, new FakeFlightLog())).toEqual({
      status: 409,
      body: {
        code: 'BRIDGE_PROBE',
        message: error.message.replace('[BRIDGE_PROBE] ', ''),
      },
    });
  });

  it('answers the tick alone when the flight log holds no entry', () => {
    expect(
      answerCommand(
        desk(() => ({ tick: 4 })),
        {},
        new FakeFlightLog(),
      ),
    ).toEqual({ status: 202, body: { tick: 4 } });
  });

  it('answers the flight log beside the tick when it holds entries', () => {
    const log = new FakeFlightLog();
    const opened = desk(() => {
      log.record('survey-7: opened bridge-habitat');
      return { tick: 4 };
    });
    expect(answerCommand(opened, {}, log)).toEqual({
      status: 202,
      body: { tick: 4, flightLog: ['survey-7: opened bridge-habitat'] },
    });
  });

  it('answers 409 with the interlock text', () => {
    const error = new InterlockError({
      door: 'airlock-outer',
      difference: 101_300,
      limit: 5_000,
    });
    expect(answerCommand(refuse(error), {}, new FakeFlightLog())).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_INTERLOCK',
        message:
          'The airlock-outer door holds 101,300 Pa of difference, above the 5,000 Pa interlock.',
        fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
      },
    });
  });

  it('rethrows an error that is not a NexusError', () => {
    const bug = new Error('the handler broke');
    expect(() => answerCommand(refuse(bug), {}, new FakeFlightLog())).toThrow(
      bug,
    );
  });
});

describe('refusalOf', () => {
  it('reads the ship, interceptor and system phase text from SHIP_TEXT', () => {
    expect(SHIP_TEXT).toEqual([
      relayText,
      shipText,
      interceptorsText,
      systemPhaseText,
    ]);
  });

  it.each([
    [
      'timeout',
      'within 5,000 ms',
      'The subspace relay did not answer the charts channel within 5,000 ms.',
    ],
    [
      'malformed',
      'a JSON object',
      'The subspace relay answered the charts channel with a table the ship cannot read. The table must be a JSON object.',
    ],
  ] as const)(
    'names RELAY_URL and dev-relay in the fix of a %s relay fault',
    (reason, expected, message) => {
      const error = new RelayError({ channel: 'charts', reason, expected });
      expect(refusalOf(error)).toEqual({
        code: 'MERIDIAN_RELAY',
        message,
        fix: 'Start the relay with `npx nx run @nexusdi/bridge-api:dev-relay` and set RELAY_URL to its address, or run `npx nx run @nexusdi/bridge-api:dev`, which starts both.',
      });
      expect(RELAY_FIX).toContain('RELAY_URL');
    },
  );

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
