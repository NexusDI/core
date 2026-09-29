/**
 * Runs one wiring-mistake probe: imports the module, creates the container
 * with adapter.ready(), then makes the first resolve with resolveBridge().
 * Prints one JSON line with the first error of each step, or null.
 */
import { pathToFileURL } from 'node:url';

/** Every message an error carries: a NexusDI BlueprintError lists each one. */
const describe = (error) =>
  Array.isArray(error?.errors) && error.errors.length > 0
    ? error.errors.map((e) => `${e.name}: ${e.message}`).join(' | ')
    : `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;

const out = { loadError: null, readyError: null, resolveError: null };
let probe;
try {
  probe = await import(pathToFileURL(process.argv[2]).href);
} catch (error) {
  out.loadError = describe(error);
}
let ship;
if (probe !== undefined) {
  try {
    ship = await probe.adapter.ready();
  } catch (error) {
    out.readyError = describe(error);
  }
}
if (ship !== undefined) {
  try {
    await probe.resolveBridge(ship);
  } catch (error) {
    out.resolveError = describe(error);
  }
}
console.log(JSON.stringify(out));
process.exit(0);
