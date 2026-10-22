import { describe, expect, it } from 'vitest';
import {
  COMMS_LOAD,
  commsDemand,
  MESSAGES_KEPT,
  RELAY_ROUND_TRIP,
  stepComms,
  type CommsRecord,
  type CommsSetpoints,
} from './comms';

const dt = 0.5;

const standby: CommsRecord = Object.freeze({
  status: 'standby',
  sent: null,
  messages: Object.freeze([]),
});
const idle: CommsSetpoints = Object.freeze({ hail: false });
const hailing: CommsSetpoints = Object.freeze({ hail: true });

/** The record of an array that sent its hail at `sent` and holds `messages`. */
function awaiting(
  sent: number,
  messages: CommsRecord['messages'] = Object.freeze([]),
): CommsRecord {
  return Object.freeze({ status: 'awaiting reply', sent, messages });
}

const linked = { dt, linked: true, shed: false };

describe('stepComms', () => {
  it('returns the record and the setpoints it got with no hail and no reply due', () => {
    const step = stepComms(standby, idle, { ...linked, tick: 1 });
    expect(step.record).toBe(standby);
    expect(step.setpoints).toBe(idle);
  });

  it('keeps a hail queued under no subspace link without the link', () => {
    const step = stepComms(standby, hailing, {
      ...linked,
      linked: false,
      tick: 1,
    });
    expect(step.record).toEqual({
      status: 'no subspace link',
      sent: null,
      messages: [],
    });
    expect(step.setpoints).toBe(hailing);
  });

  it('returns the record it got on a later tick with no link', () => {
    const first = stepComms(standby, hailing, {
      ...linked,
      linked: false,
      tick: 1,
    });
    const second = stepComms(first.record, first.setpoints, {
      ...linked,
      linked: false,
      tick: 2,
    });
    expect(second.record).toBe(first.record);
    expect(second.setpoints).toBe(first.setpoints);
  });

  it('keeps a hail queued under no power when the router shed comms', () => {
    const step = stepComms(standby, hailing, {
      ...linked,
      shed: true,
      tick: 1,
    });
    expect(step.record).toEqual({
      status: 'no power',
      sent: null,
      messages: [],
    });
    expect(step.setpoints).toBe(hailing);
  });

  it('sends a hail with the link and the power', () => {
    const step = stepComms(standby, hailing, { ...linked, tick: 4 });
    expect(step.record).toEqual({
      status: 'awaiting reply',
      sent: 4,
      messages: [],
    });
    expect(step.setpoints).toEqual({ hail: false });
  });

  it('answers 2 s after the send: tick 14 at dt 0.5 for a hail sent at tick 10', () => {
    expect(RELAY_ROUND_TRIP).toBe(2);
    const record = awaiting(10);
    const early = stepComms(record, idle, { ...linked, tick: 13 });
    expect(early.record).toBe(record);
    const due = stepComms(record, idle, { ...linked, tick: 14 });
    expect(due.record).toEqual({
      status: 'standby',
      sent: 10,
      messages: [
        { tick: 14, from: 'fleet traffic control', text: 'sector clear' },
      ],
    });
    expect(due.setpoints).toBe(idle);
  });

  it('answers 2 ticks after the send at dt 1', () => {
    const record = awaiting(10);
    const step = { ...linked, dt: 1 };
    expect(stepComms(record, idle, { ...step, tick: 11 }).record).toBe(record);
    expect(stepComms(record, idle, { ...step, tick: 12 }).record).toEqual({
      status: 'standby',
      sent: 10,
      messages: [
        { tick: 12, from: 'fleet traffic control', text: 'sector clear' },
      ],
    });
  });

  it('keeps the newest 10 messages over eleven replies', () => {
    expect(MESSAGES_KEPT).toBe(10);
    let record = standby;
    let tick = 0;
    for (let reply = 0; reply < 11; reply++) {
      tick += 1;
      record = stepComms(record, hailing, { ...linked, tick }).record;
      tick += 4;
      record = stepComms(record, idle, { ...linked, tick }).record;
    }
    expect(record.messages).toHaveLength(10);
    expect(record.messages[0]).toEqual({
      tick: 10,
      from: 'fleet traffic control',
      text: 'sector clear',
    });
    expect(record.messages[9]).toEqual({
      tick: 55,
      from: 'fleet traffic control',
      text: 'sector clear',
    });
    expect(record.sent).toBe(51);
  });

  it('holds a hail queued while it awaits a reply and leaves the record alone', () => {
    const record = awaiting(1);
    const step = stepComms(record, hailing, { ...linked, tick: 3 });
    expect(step.record).toBe(record);
    expect(step.setpoints).toBe(hailing);
  });

  it('holds the hail on the reply tick and sends it on the tick after', () => {
    const due = stepComms(awaiting(1), hailing, { ...linked, tick: 5 });
    expect(due.record).toEqual({
      status: 'standby',
      sent: 1,
      messages: [
        { tick: 5, from: 'fleet traffic control', text: 'sector clear' },
      ],
    });
    expect(due.setpoints).toBe(hailing);
    const next = stepComms(due.record, due.setpoints, { ...linked, tick: 6 });
    expect(next.record).toEqual({
      status: 'awaiting reply',
      sent: 6,
      messages: [
        { tick: 5, from: 'fleet traffic control', text: 'sector clear' },
      ],
    });
    expect(next.setpoints).toEqual({ hail: false });
  });

  it('freezes every level of a stepped record and the setpoints', () => {
    const earlier = Object.freeze({
      tick: 2,
      from: 'fleet traffic control',
      text: 'sector clear',
    });
    const replied = stepComms(awaiting(10, Object.freeze([earlier])), idle, {
      ...linked,
      tick: 14,
    }).record;
    const sent = stepComms(replied, hailing, { ...linked, tick: 15 });
    const queued = stepComms(standby, hailing, {
      ...linked,
      linked: false,
      tick: 1,
    }).record;
    for (const record of [replied, sent.record, queued]) {
      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.messages)).toBe(true);
      for (const message of record.messages) {
        expect(Object.isFrozen(message)).toBe(true);
      }
    }
    expect(replied.messages).toHaveLength(2);
    expect(Object.isFrozen(sent.setpoints)).toBe(true);
  });
});

describe('commsDemand', () => {
  it('draws the array at priority 3 with no heat', () => {
    expect(COMMS_LOAD).toEqual({
      id: 'comms',
      priority: 3,
      demand: 5_000_000,
      heatShare: 0,
    });
  });

  it('asks 5,000,000 W on the tick the array sends', () => {
    expect(commsDemand(standby, hailing, true)).toBe(5_000_000);
  });

  it.each([
    ['offline', standby, hailing, false],
    ['while it awaits a reply', awaiting(1), hailing, true],
    ['with no hail', standby, idle, true],
  ])('asks 0 W %s', (_, record, setpoints, isLinked) => {
    expect(commsDemand(record, setpoints, isLinked)).toBe(0);
  });
});
