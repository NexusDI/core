/** Constants of the scale suite (spec 2026-10-01, sections 2, 3.1 and 14). */

/**
 * Seeds every generated graph. Change it only when the generator changes:
 * every graph hash changes with it, and the change is reviewed like a
 * fixture change.
 */
export const GRAPH_SEED = 20261001;

/**
 * The sizes, ascending. Every table, chart and exponent column follows this
 * list. Adding one (2,500, the size of the largest apps measured, is the
 * candidate) takes its entry here, its committed hashes and a band row in
 * shapes.test.ts, and a regenerated scale.json.
 */
export const SIZES = [50, 200, 1000, 5000] as const;

/**
 * The two sizes the per-provider bytes and time come from, whatever sizes lie
 * between them: the library's fixed size stays out of the slope.
 */
export const PER_PROVIDER = { from: 1000, to: 5000 } as const;
export type Size = (typeof SIZES)[number];

/**
 * `mixed` is the headline. `wide`, `deep` and `modular` isolate one property
 * each (registration and lookup, recursion depth, module structure), and
 * `mixed-async` is `mixed` with its lowest-index 5% of factories made async.
 */
export const SHAPES = [
  'mixed',
  'wide',
  'deep',
  'modular',
  'mixed-async',
] as const;
export type Shape = (typeof SHAPES)[number];

/** Measured fresh-process rounds per shape. Relative claims cite `mixed` only. */
export const ROUNDS: Readonly<Record<Shape, number>> = {
  mixed: 1000,
  wide: 200,
  deep: 200,
  modular: 200,
  'mixed-async': 200,
};

/** FNV-1a, 32 bits, over a string's UTF-16 code units. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The seed of one shape's stream at one size. Each shape draws from its own
 * stream, so a change to one shape's algorithm leaves the other graphs as
 * they were.
 */
export function streamSeed(
  shape: Shape,
  size: number,
  seed = GRAPH_SEED,
): number {
  return (seed ^ hash32(shape) ^ size) >>> 0;
}
