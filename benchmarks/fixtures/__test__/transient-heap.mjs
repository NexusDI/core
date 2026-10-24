/**
 * A test preload (node --import): holds about 1 MB of live objects across
 * chosen settle passes. A pass is two gc() calls, counted from the first
 * settle loop of child.mjs (the warm-up), so pass p is calls 2p - 1 and 2p.
 * The objects are live from the end of a chosen pass's second call until the
 * next gc() call, so the heap read of that pass sees them and the next
 * pass's read does not.
 *
 * TRANSIENT_PASS=p chooses pass p. TRANSIENT_EVERY=n chooses every n-th pass.
 */
const real = globalThis.gc;
const pass = Number(process.env.TRANSIENT_PASS ?? 0);
const every = Number(process.env.TRANSIENT_EVERY ?? 0);
let calls = 0;
let held;
globalThis.gc = (...args) => {
  calls++;
  if (calls % 2 === 1) held = undefined;
  const result = real?.(...args);
  if (calls % 2 === 0) {
    const p = calls / 2;
    if (p === pass || (every > 0 && p % every === 0))
      held = Array.from({ length: 25_000 }, (_, i) => ({ i }));
  }
  return result;
};
