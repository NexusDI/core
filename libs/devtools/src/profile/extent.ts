/**
 * The least and the most of a list of numbers, as loops. A spread call such
 * as Math.min(...values) throws a RangeError past 65,536 arguments in
 * JavaScriptCore, and a report of 1,000 runs can hold more spans than that.
 */
export function least(values: Iterable<number>, start: number): number {
  let result = start;
  for (const value of values) if (value < result) result = value;
  return result;
}

/** The most of `values`, or `start` when none is greater. */
export function most(values: Iterable<number>, start: number): number {
  let result = start;
  for (const value of values) if (value > result) result = value;
  return result;
}
