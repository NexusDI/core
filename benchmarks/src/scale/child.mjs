/**
 * One fresh-process sample of a scale cell (scale spec 6.1). Plain
 * JavaScript, never compiled, so every library's bundle meets the same code.
 * Run by fresh.ts, one process per sample:
 *
 *   node --expose-gc child.mjs <bundle.mjs> <graph.json> <packages.mjs>
 *
 * Imports the cell's packages.mjs untimed, reads the base heap, then times load,
 * create, first-get and rest with process.hrtime.bigint(), and reads the
 * retained heap with the handle still referenced. The gc() calls sit between
 * timed phases. Sends one `sample` message in ns and bytes, or exits 1 with
 * the reason on stderr.
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

/**
 * A heap read once V8's background work (concurrent compile jobs) has
 * finished: collect after a pause, until two reads in a row are equal, at
 * most ten times. Both reads sit outside the timed phases.
 */
async function settledHeap() {
  let last = -1;
  for (let i = 0; i < 10; i++) {
    await sleep(10);
    collect();
    const now = retainedHeap(getHeapSpaceStatistics());
    if (now === last) return now;
    last = now;
  }
  return last;
}

// The indices to resolve after the target, from the model, so the array is
// built before the base heap read and sits in it. verify-child.mjs has
// already checked that the app declares the same count and target.
const others = [];
for (let i = 0; i < graph.providers.length; i++)
  if (i !== graph.target) others.push(i);

const base = await settledHeap();

let t = ns();
const { scale } = await import(pathToFileURL(bundle).href);
const load = Number(ns() - t);
if (scale === undefined) fail('the bundle exports no scale app');

collect();
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
process.send({ type: 'sample', load, create, firstGet, rest, heapReady }, () =>
  process.disconnect(),
);
