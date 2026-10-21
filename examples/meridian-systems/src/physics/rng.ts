/**
 * The integer arithmetic behind the seeded random source.
 *
 * Every operation is `Math.imul`, an XOR, a shift or `>>> 0`, so each step is
 * exact 32-bit integer arithmetic. ECMAScript defines those operations bit for
 * bit, which gives one sequence on every engine. A floating-point multiply
 * would round differently across engines and break the golden run.
 */

/** One splitmix32 step: the next `uint32` and the state that follows it. */
export function splitmix32(state: number): { value: number; state: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return { value: (z ^ (z >>> 15)) >>> 0, state: next };
}

/** FNV-1a over the UTF-16 code units of `text`, as a `uint32`. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
}
