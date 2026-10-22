import { defineModule, provide } from '@nexusdi/core';
import {
  type Alarm,
  ALARM_SINKS,
  type IAlarmSink,
} from '@nexusdi/meridian-systems';

import { AUDIT_LOG, AuditTrail, type IAuditLog } from './audit-trail.module';

/** Writes each alarm MasterAlarm raises or clears as one audit line. */
class AuditAlarmSink implements IAlarmSink {
  static deps = [AUDIT_LOG] as const;
  constructor(private readonly audit: IAuditLog) {}
  raise(alarm: Alarm, tick: number) {
    this.audit.record(`raised ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
  clear(alarm: Alarm, tick: number) {
    this.audit.record(`cleared ${alarm.code} ${alarm.subject} at tick ${tick}`);
  }
}

/**
 * Global, because Safety imports nothing from the bridge: all(ALARM_SINKS)
 * in Safety reads the sinks of Safety and its imports, and the exports of
 * every global module.
 */
export const AlarmPanel = defineModule({
  name: 'AlarmPanel',
  global: true,
  imports: [AuditTrail],
  providers: [provide(ALARM_SINKS, { useClass: AuditAlarmSink })],
  exports: [ALARM_SINKS],
});
