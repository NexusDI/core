import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CommandAnswer } from '../../app/di/contracts';
import { answerBand, useShipCommand } from '../../app/hooks/use-ship-command';
import { shipAtStart } from '../doubles';

const queued: CommandAnswer = { accepted: true, tick: 1205 };
const at = (tick: number) => ({ ...shipAtStart, tick });

describe('answerBand', () => {
  it('queues an accepted command while the ship is before its tick', () => {
    expect(answerBand(queued, at(1204))).toEqual({
      state: 'queued',
      tick: 1205,
    });
  });

  it('queues when no reading arrives', () => {
    expect(answerBand(queued, null)).toEqual({ state: 'queued', tick: 1205 });
  });

  it('applies the command once the ship reaches its tick', () => {
    expect(answerBand(queued, at(1205))).toEqual({
      state: 'applied',
      tick: 1205,
      appliedAt: 1205,
    });
  });

  it('records the tick of the reading that applied it', () => {
    expect(answerBand(queued, at(1300))).toMatchObject({
      state: 'applied',
      appliedAt: 1300,
    });
  });

  it('carries the flight log and the notice', () => {
    const notice = { code: 'MERIDIAN_X', message: 'waits' };
    const answer: CommandAnswer = {
      accepted: true,
      tick: 3,
      flightLog: ['a'],
      notice,
    };
    expect(answerBand(answer, at(1))).toEqual({
      state: 'queued',
      tick: 3,
      flightLog: ['a'],
      notice,
    });
  });

  it('reports a refusal with its fix', () => {
    const refused: CommandAnswer = {
      accepted: false,
      status: 409,
      code: 'MERIDIAN_X',
      message: 'no',
      fix: 'do y',
    };
    expect(answerBand(refused, at(9))).toEqual({
      state: 'refused',
      code: 'MERIDIAN_X',
      message: 'no',
      fix: 'do y',
    });
  });

  it('leaves out a fix a refusal lacks', () => {
    const band = answerBand(
      { accepted: false, status: 400, code: 'C', message: 'm' },
      null,
    );
    expect(band).toEqual({ state: 'refused', code: 'C', message: 'm' });
    expect('fix' in band).toBe(false);
  });
});

describe('useShipCommand', () => {
  it('is undefined with no answer', () => {
    const { result } = renderHook(() => useShipCommand(undefined, at(1)));
    expect(result.current).toBeUndefined();
  });

  it('turns from queued to applied as the ship reading advances', () => {
    const { result, rerender } = renderHook(
      ({ ship }) => useShipCommand(queued, ship),
      { initialProps: { ship: at(1204) } },
    );
    expect(result.current?.state).toBe('queued');
    rerender({ ship: at(1205) });
    expect(result.current?.state).toBe('applied');
  });
});
