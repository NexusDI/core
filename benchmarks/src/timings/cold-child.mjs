/**
 * The cold-start child (spec 4.7): imports the compiled fixture, wires
 * Meridian-8, resolves the bridge and reports its own clock.
 */
import { pathToFileURL } from 'node:url';

const { adapter } = await import(pathToFileURL(process.argv[2]).href);
const ship = await adapter.ready();
ship.get('bridge');
// Disconnecting before the message is flushed loses it.
process.send({ type: 'ready', now: performance.now() }, () =>
  process.disconnect(),
);
