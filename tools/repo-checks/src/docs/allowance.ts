import { readFileSync } from 'node:fs';

/** An allowance or ratchet file, parsed. */
export function readAllowance<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/**
 * A count that may only fall.
 *
 * `over` is a count above its entry (or above zero with no entry), `slack` an
 * entry above the count it covers, and `stale` an entry for a key that no
 * longer has a count. The libraries ratchets fail on all three, so the file
 * records the real number and nothing more.
 */
export function ratchet(
  actual: Record<string, number>,
  allowed: Record<string, number>,
): { over: string[]; slack: string[]; stale: string[] } {
  const over: string[] = [];
  const slack: string[] = [];

  for (const [key, count] of Object.entries(actual)) {
    const limit = allowed[key] ?? 0;
    if (count > limit) over.push(`${key}: ${count}, allowance ${limit}`);
    if (key in allowed && count < limit)
      slack.push(`${key}: ${count}, allowance ${limit}`);
  }

  const stale = Object.keys(allowed).filter((key) => !(key in actual));

  return { over: over.sort(), slack: slack.sort(), stale: stale.sort() };
}

/**
 * Work that is coming, keyed by what it is for, with the reason as the value.
 *
 * `stale` is an entry whose work is done, and `unexplained` an entry with an
 * empty reason. Both fail, so an allowance empties as Phase 2 writes the pages.
 */
export function waits(
  done: ReadonlySet<string>,
  allowance: Record<string, string>,
): { stale: string[]; unexplained: string[] } {
  return {
    stale: Object.keys(allowance)
      .filter((key) => done.has(key))
      .sort(),
    unexplained: Object.entries(allowance)
      .filter(([, reason]) => reason.trim() === '')
      .map(([key]) => key)
      .sort(),
  };
}
