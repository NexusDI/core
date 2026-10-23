import type { ShipSnapshot } from './contracts';

/**
 * Rounds a fraction to four significant digits and keeps an integer exact.
 * `Math.exp` and `Math.cos` may differ in the last bit between engines
 * (spec §8.3), and four digits hide that difference in a value far from a
 * threshold.
 */
export function roundNumber(value: number): number {
  return roundToDigits(value, 4);
}

/**
 * The significant digits a `readShip` reading keeps. Eight digits leave a
 * gauge room to round the figure once to its own decimals, and they still
 * hide a last-bit difference of `Math.exp` or `Math.cos` between engines.
 */
const READING_DIGITS = 8;

/**
 * Rounds a fraction to `READING_DIGITS` significant digits and keeps an
 * integer exact.
 */
export function roundReadingNumber(value: number): number {
  return roundToDigits(value, READING_DIGITS);
}

function roundToDigits(value: number, digits: number): number {
  return Number.isInteger(value) ? value : Number(value.toPrecision(digits));
}

/**
 * A plain JSON copy of `value` with every number through `round`, which is
 * `roundNumber` unless the caller names another.
 */
export function roundJson<T>(
  value: T,
  round: (number: number) => number = roundNumber,
): T {
  return JSON.parse(
    JSON.stringify(value, (_key, field: unknown) =>
      typeof field === 'number' ? round(field) : field,
    ),
  ) as T;
}

/** A plain JSON copy of `ship` with every number through `roundNumber`, as the golden prints it. */
export function roundSnapshot(ship: ShipSnapshot): ShipSnapshot {
  return roundJson(ship);
}
