/**
 * A test preload (node --import): counts the child's gc() calls and writes the
 * count to the file GC_COUNT_FILE names when the process exits.
 */
import { writeFileSync } from 'node:fs';

const real = globalThis.gc;
let calls = 0;
globalThis.gc = (...args) => {
  calls++;
  return real?.(...args);
};
process.on('exit', () => {
  if (process.env.GC_COUNT_FILE)
    writeFileSync(process.env.GC_COUNT_FILE, String(calls));
});
