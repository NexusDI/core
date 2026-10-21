import type { ShipSnapshot } from './contracts';

/**
 * Rounds a fraction to four significant digits and keeps an integer exact.
 * `Math.exp` and `Math.cos` may differ in the last bit between engines
 * (spec §8.3), and four digits hide that difference in a value far from a
 * threshold.
 */
export function roundNumber(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toPrecision(4));
}

/** A plain JSON copy of `ship` with every number through `roundNumber`, as the routes and the golden print it. */
export function roundSnapshot(ship: ShipSnapshot): ShipSnapshot {
  return JSON.parse(
    JSON.stringify(ship, (_key, value: unknown) =>
      typeof value === 'number' ? roundNumber(value) : value,
    ),
  ) as ShipSnapshot;
}
