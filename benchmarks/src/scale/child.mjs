/**
 * One fresh-process sample of a scale cell (scale spec 6.1). Plain
 * JavaScript, never compiled, so every library's bundle meets the same code.
 * Run by fresh.ts, one process per sample:
 *
 *   node --expose-gc child.mjs <bundle.mjs> <graph.json> <packages.mjs>
 *
 * Imports the cell's packages.mjs untimed, warms the settle loop, reads the
 * settled base heap, then times load, create, first-get and rest with
 * process.hrtime.bigint() and reads the settled heap again with the handle
 * still referenced. Sends one `sample` message in ns and bytes, or exits 1
 * with the reason on stderr.
 *
 * Nothing collects between the base read and the final read except what V8
 * schedules itself: a forced gc() before `create` removed up to 11% of a
 * competitor's cost (the load garbage a real app collects during `create`)
 * on the protocol check of spec 7.4.
 */
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { getHeapSpaceStatistics } from 'node:v8';

import { retainedHeap } from './heap.mjs';

const [bundle, graphPath, packagesFile] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}
if (typeof globalThis.gc !== 'function') fail('run with --expose-gc');

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
// A value and an alias construct nothing.
const constructed = graph.providers.filter(
  (p) => p.kind !== 'value' && p.kind !== 'alias',
).length;

const collect = () => {
  globalThis.gc();
  globalThis.gc();
};

const ns = () => process.hrtime.bigint();

// Library import time is the cold-start figure, so it stays untimed.
await import(pathToFileURL(packagesFile).href);

const WINDOW = 3;
const TOLERANCE = 1024;

/**
 * A heap read once V8's background work has finished: collect after a pause,
 * until the last three reads lie within 1 KB of each other, at most ten
 * times, and return the smallest of those three. V8 can hold a transient of
 * about 200 KB in trusted_space for one pass (a background job in flight).
 * It only adds to a read, so a transient breaks the agreement, and the
 * smallest read of a window drops one that persists in part of it. A cold
 * loop grows the heap by 0.4 to 5.5 KB per pass with its own code and timers
 * and never agrees; once warm it grows about 100 bytes per pass, inside the
 * tolerance, so the caller runs one discarded loop first. All reads sit
 * outside the timed phases.
 */
async function settledHeap() {
  const reads = [];
  for (let i = 0; i < 10; i++) {
    await sleep(10);
    collect();
    reads.push(retainedHeap(getHeapSpaceStatistics()));
    if (reads.length >= WINDOW) {
      const window = reads.slice(-WINDOW);
      const low = Math.min(...window);
      if (Math.max(...window) - low <= TOLERANCE) return low;
    }
  }
  return Math.min(...reads.slice(-WINDOW));
}

// The indices to resolve after the target, from the model, so the array is
// built before the base heap read and sits in it. verify-child.mjs has
// already checked that the app declares the same count and target.
const others = [];
for (let i = 0; i < graph.providers.length; i++)
  if (i !== graph.target) others.push(i);

// Warms the settle loop itself; the base read below is the first warm one.
await settledHeap();
const base = await settledHeap();

let t = ns();
const { scale } = await import(pathToFileURL(bundle).href);
const load = Number(ns() - t);
if (scale === undefined) fail('the bundle exports no scale app');

t = ns();
let handle = scale.create();
// A synchronous create pays no microtask turn.
if (typeof handle?.then === 'function') handle = await handle;
const create = Number(ns() - t);

let firstGet;
let rest;
if (typeof scale.getAsync === 'function') {
  t = ns();
  await scale.getAsync(handle, scale.target);
  firstGet = Number(ns() - t);
  t = ns();
  for (const i of others) await scale.getAsync(handle, i);
  rest = Number(ns() - t);
} else {
  t = ns();
  scale.get(handle, scale.target);
  firstGet = Number(ns() - t);
  t = ns();
  for (const i of others) scale.get(handle, i);
  rest = Number(ns() - t);
}

const heapReady = (await settledHeap()) - base;
// The handle must still be reachable at the heap read above.
globalThis.__scaleHandle = handle;

const total = scale.built.counts.reduce((sum, c) => sum + c, 0);
if (total !== constructed)
  fail(`construction count ${total}, expected ${constructed}`);

// Disconnecting before the message is flushed loses it.
process.send(
  {
    type: 'sample',
    load,
    create,
    firstGet,
    rest,
    heapReady,
  },
  () => process.disconnect(),
);
