import type { PowerLoad } from './power';

/** What the phased array is doing at the end of a tick. */
export type CommsStatus =
  'standby' | 'no subspace link' | 'no power' | 'awaiting reply';

/** One message the array received. */
export interface CommsMessage {
  /** The tick the message arrived. */
  readonly tick: number;
  readonly from: string;
  readonly text: string;
}

/** The phased array at the end of a tick. */
export interface CommsRecord {
  readonly status: CommsStatus;
  /** The tick the array sent its last hail, or null before the first. */
  readonly sent: number | null;
  /** The newest `MESSAGES_KEPT` messages the array received, oldest first. */
  readonly messages: readonly CommsMessage[];
}

/** What the crew set for comms. */
export interface CommsSetpoints {
  /** True while a hail waits for the array to send it. */
  readonly hail: boolean;
}

/**
 * The phased array's place on the power router. It asks this
 * demand on each tick a hail waits on a linked array with no reply
 * outstanding and 0 W otherwise, and puts none of its power into the coolant
 * loop.
 */
export const COMMS_LOAD: PowerLoad = {
  id: 'comms',
  priority: 3,
  demand: 5e6,
  heatShare: 0,
};

/** The seconds from a hail to the relay's reply. */
export const RELAY_ROUND_TRIP = 2;

/** The station that answers every hail. */
const FLEET_TRAFFIC_CONTROL = 'fleet traffic control';

/** The reply fleet traffic control sends. */
const SECTOR_CLEAR = 'sector clear';

/** The most messages the record keeps. */
export const MESSAGES_KEPT = 10;

/** True when the array sends the queued hail on a tick that starts from `record`. */
function sends(
  record: CommsRecord,
  setpoints: CommsSetpoints,
  linked: boolean,
): boolean {
  return linked && setpoints.hail && record.status !== 'awaiting reply';
}

/**
 * The power the array asks the router for, in W, from the snapshot at the
 * start of the tick: `COMMS_LOAD.demand` when a hail waits on a linked array
 * with no reply outstanding, and 0 W otherwise. `stepComms` sends on this
 * condition when the router did not shed the load, so the router allocates the
 * power on the tick the array sends.
 */
export function commsDemand(
  record: CommsRecord,
  setpoints: CommsSetpoints,
  linked: boolean,
): number {
  return sends(record, setpoints, linked) ? COMMS_LOAD.demand : 0;
}

/** Everything one comms step reads beside the record and the setpoints. */
interface CommsTick {
  /** The tick this step computes. */
  readonly tick: number;
  /** Seconds. */
  readonly dt: number;
  /** True when the ship's graph binds a subspace link. */
  readonly linked: boolean;
  /** True when the router shed the comms load this tick. */
  readonly shed: boolean;
}

/** The record with fleet traffic control's reply at `tick` appended. */
function reply(record: CommsRecord, tick: number): CommsRecord {
  const message = Object.freeze({
    tick,
    from: FLEET_TRAFFIC_CONTROL,
    text: SECTOR_CLEAR,
  });
  return Object.freeze({
    ...record,
    status: 'standby',
    messages: Object.freeze(
      [...record.messages, message].slice(-MESSAGES_KEPT),
    ),
  });
}

/** `record` with `status`, or `record` itself when it already reads it. */
function withStatus(record: CommsRecord, status: CommsStatus): CommsRecord {
  return record.status === status
    ? record
    : Object.freeze({ ...record, status });
}

/**
 * Steps the phased array in phase 6.
 *
 * First a reply falls due: an array that awaits one gets it once
 * `(tick − sent) · dt` reaches `RELAY_ROUND_TRIP`, and returns to standby
 * with the newest `MESSAGES_KEPT` messages. Then the step judges a queued
 * hail on the record the tick started with. The hail waits while a reply is
 * outstanding. Without the link it waits under `no subspace link`, and under
 * `no power` when the router shed comms. With the link and the power the
 * array sends it, so a hail queued behind a reply goes out on the tick after
 * the reply. With no hail and no reply due the step returns the objects it
 * got, and every record it builds is frozen at every level.
 */
export function stepComms(
  record: CommsRecord,
  setpoints: CommsSetpoints,
  { tick, dt, linked, shed }: CommsTick,
): { readonly record: CommsRecord; readonly setpoints: CommsSetpoints } {
  const awaiting = record.status === 'awaiting reply';
  let next = record;
  if (
    awaiting &&
    record.sent !== null &&
    (tick - record.sent) * dt >= RELAY_ROUND_TRIP
  ) {
    next = reply(record, tick);
  }
  if (!setpoints.hail || awaiting) return { record: next, setpoints };
  if (!linked) {
    return { record: withStatus(next, 'no subspace link'), setpoints };
  }
  if (shed) return { record: withStatus(next, 'no power'), setpoints };
  return {
    record: Object.freeze({ ...next, status: 'awaiting reply', sent: tick }),
    setpoints: Object.freeze({ ...setpoints, hail: false }),
  };
}
