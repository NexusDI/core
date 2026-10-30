import type { IAuditLog, ICommsLog } from '../ship/contracts';

/** What `GET /audit` answers: the audited chart calls, and the comms log. */
export interface AuditAnswer {
  readonly calls: readonly string[];
  readonly comms: readonly string[];
}

/** Reads both logs at the moment of the request. */
export const answerAudit = (
  audit: IAuditLog,
  comms: ICommsLog,
): AuditAnswer => ({
  calls: [...audit.calls],
  comms: [...comms.entries],
});
