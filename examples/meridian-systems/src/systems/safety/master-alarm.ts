import { all } from '@nexusdi/core';

import { callAll } from '../../simulation/call-all';
import {
  type ITickLoop,
  type ShipSnapshot,
  TICK_LOOP,
} from '../../simulation/contracts';

import {
  ALARM_SINKS,
  type Alarm,
  type IAlarmSink,
  type IMasterAlarm,
} from './contracts';

function key(alarm: Alarm): string {
  return `${alarm.code}:${alarm.subject}`;
}

/**
 * Tells every alarm sink what each tick raised and cleared. It listens to
 * the loop in `onInit`, so a container built with `onInit: false` gives an
 * alarm that never hears a tick.
 */
export class MasterAlarm implements IMasterAlarm, Disposable {
  // all(ALARM_SINKS) reads Safety's own providers plus the contributions of
  // every module that names ALARM_SINKS in its exports.
  static deps = [TICK_LOOP, all(ALARM_SINKS)] as const;

  private last: readonly Alarm[] = [];
  private stopListening: (() => void) | undefined;

  constructor(
    private readonly loop: ITickLoop,
    private readonly sinks: readonly IAlarmSink[],
  ) {}

  onInit(): void {
    this.stopListening = this.loop.listen((ship) => this.dispatch(ship));
  }

  active(): readonly Alarm[] {
    return this.last;
  }

  [Symbol.dispose](): void {
    this.stopListening?.();
  }

  /**
   * Clears the alarms gone since the last tick in their old order, then
   * raises the new ones in the order of the record. The set moves on before
   * any sink runs, so a throwing sink never makes the next tick repeat a
   * call.
   */
  private dispatch(ship: ShipSnapshot): void {
    const before = new Set(this.last.map(key));
    const now = new Set(ship.safety.alarms.map(key));
    const gone = this.last.filter((alarm) => !now.has(key(alarm)));
    const raised = ship.safety.alarms.filter(
      (alarm) => !before.has(key(alarm)),
    );
    this.last = ship.safety.alarms;
    const calls = [
      ...gone.map(
        (alarm) => (sink: IAlarmSink) => sink.clear(alarm, ship.tick),
      ),
      ...raised.map(
        (alarm) => (sink: IAlarmSink) => sink.raise(alarm, ship.tick),
      ),
    ];
    // Each call goes to every sink before the next call starts.
    callAll(
      calls.flatMap((call) => this.sinks.map((sink) => () => call(sink))),
      undefined,
    );
  }
}
