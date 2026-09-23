/**
 * The /v0.3/ retention of spec §15.7: the snapshot stays six months after
 * finalDate or until @nexusdi/core@0.5.0 is tagged, whichever is later.
 */

/** A YYYY-MM-DD date plus whole months, in UTC, clamped to the month's end. */
export function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Whether both retention conditions hold on `today`. */
export function retentionEnded({ finalDate, v050Date, today }) {
  if (finalDate === null || v050Date === null) return false;
  const sixMonths = addMonths(finalDate, 6);
  const released = new Date(`${v050Date}T00:00:00Z`);
  return today >= sixMonths && today >= released;
}
