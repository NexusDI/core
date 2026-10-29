import { defineModule, provide } from '@nexusdi/core';
import {
  type Alarm,
  ALARM_SINKS,
  type IAlarmSink,
} from '@nexusdi/meridian-systems';

import { AuditTrail } from './audit-trail.module';
import { AUDIT_LOG, type IAuditLog } from './contracts';

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
 * Exports ALARM_SINKS, so all(ALARM_SINKS) in Safety reads the audit sink
 * although Safety imports nothing from the bridge.
 */
export const AlarmPanel = defineModule({
  name: 'AlarmPanel',
  imports: [AuditTrail],
  providers: [provide(ALARM_SINKS, { useClass: AuditAlarmSink })],
  exports: [ALARM_SINKS],
});
