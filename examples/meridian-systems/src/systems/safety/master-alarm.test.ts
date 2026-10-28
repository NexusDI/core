import { describe, expect, it, vi } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { Alarm } from '../../physics/safety';
import type {
  ITickLoop,
  ShipSnapshot,
  TickListener,
} from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IAlarmSink } from './contracts';
import { MasterAlarm } from './master-alarm';

/** Records the listener the alarm gives `listen` and counts the unsubscribes. */
class FakeLoop implements ITickLoop {
  listeners: TickListener[] = [];
  readonly unsubscribe = vi.fn();
  advance(): ShipSnapshot {
    throw new Error('The alarm never advances the loop.');
  }
  attach(): () => void {
    throw new Error('The alarm never attaches a system.');
  }
  listen(listener: TickListener): () => void {
    this.listeners.push(listener);
    return this.unsubscribe;
  }
  tick(ship: ShipSnapshot): void {
    for (const listener of this.listeners) listener(ship);
  }
}

class RecordingSink implements IAlarmSink {
  readonly calls: string[] = [];
  raise(alarm: Alarm, tick: number): void {
    this.calls.push(`raised ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
  clear(alarm: Alarm, tick: number): void {
    this.calls.push(`cleared ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
}

const idle = new ShipStateStore(deck).snapshot();

/** The idle ship at `tick` with `alarms` active. */
function at(tick: number, alarms: readonly Alarm[]): ShipSnapshot {
  return { ...idle, tick, safety: { ...idle.safety, alarms } };
}

const fire: Alarm = { code: 'FIRE', subject: 'habitat' };
const decompression: Alarm = { code: 'DECOMPRESSION', subject: 'habitat' };
const shed: Alarm = { code: 'LOAD_SHED', subject: 'life-support' };

function build(sinks: IAlarmSink[]) {
  const loop = new FakeLoop();
  const alarm = new MasterAlarm(loop, sinks);
  alarm.onInit();
  return { loop, alarm };
}

describe('MasterAlarm', () => {
  it('listens to the loop once at init and starts with no alarm', () => {
    const { loop, alarm } = build([]);
    expect(loop.listeners).toHaveLength(1);
    expect(alarm.active()).toEqual([]);
  });

  it('raises each new alarm once, in the order of the record', () => {
    const sink = new RecordingSink();
    const { loop, alarm } = build([sink]);
    loop.tick(at(1, [fire, decompression]));
    loop.tick(at(2, [fire, decompression]));
    expect(sink.calls).toEqual([
      'raised FIRE habitat at tick 1',
      'raised DECOMPRESSION habitat at tick 1',
    ]);
    expect(alarm.active()).toEqual([fire, decompression]);
  });

  it('clears the gone alarms in the old order before it raises the new ones', () => {
    const sink = new RecordingSink();
    const { loop, alarm } = build([sink]);
    loop.tick(at(1, [fire, decompression, shed]));
    sink.calls.length = 0;
    loop.tick(
      at(2, [decompression, { code: 'SENSOR_FAULT', subject: 'bridge' }]),
    );
    expect(sink.calls).toEqual([
      'cleared FIRE habitat at tick 2',
      'cleared LOAD_SHED life-support at tick 2',
      'raised SENSOR_FAULT bridge at tick 2',
    ]);
    expect(alarm.active()).toEqual([
      decompression,
      { code: 'SENSOR_FAULT', subject: 'bridge' },
    ]);
  });

  it('keys an alarm by its code and its subject', () => {
    const sink = new RecordingSink();
    const { loop } = build([sink]);
    loop.tick(at(1, [fire]));
    loop.tick(at(2, [{ code: 'FIRE', subject: 'bridge' }]));
    expect(sink.calls).toEqual([
      'raised FIRE habitat at tick 1',
      'cleared FIRE habitat at tick 2',
      'raised FIRE bridge at tick 2',
    ]);
  });

  it('serves every sink when one throws, then throws its error', () => {
    const boom = new Error('boom');
    const first = new RecordingSink();
    const broken = new RecordingSink();
    broken.raise = () => {
      throw boom;
    };
    const last = new RecordingSink();
    const { loop, alarm } = build([first, broken, last]);
    expect(() => loop.tick(at(1, [fire]))).toThrow(boom);
    expect(first.calls).toEqual(['raised FIRE habitat at tick 1']);
    expect(last.calls).toEqual(['raised FIRE habitat at tick 1']);
    expect(alarm.active()).toEqual([fire]);
    loop.tick(at(2, [fire]));
    expect(last.calls).toHaveLength(1);
  });

  it('leaves the loop at dispose', () => {
    const { loop, alarm } = build([]);
    alarm[Symbol.dispose]();
    expect(loop.unsubscribe).toHaveBeenCalledOnce();
  });
});
