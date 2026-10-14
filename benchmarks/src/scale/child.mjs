/**
 * One fresh-process sample of a scale cell (scale spec 6.1). Plain
 * JavaScript, never compiled, so every library's bundle meets the same code.
 * Run by fresh.ts, one process per sample:
 *
 *   node --expose-gc child.mjs <bundle.mjs> <graph.json> [package ...]
 *
 * Imports the packages untimed, reads the base heap, then times load,
 * create, first-get and rest with process.hrtime.bigint(), and reads the
 * retained heap with the handle still referenced. The gc() calls sit between
 * timed phases. Sends one `sample` message in ns and bytes, or exits 1 with
 * the reason on stderr.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getHeapSpaceStatistics } from 'node:v8';

import { retainedHeap } from './heap.mjs';

const [bundle, graphPath, ...packages] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}
if (typeof globalThis.gc !== 'function') fail('run with --expose-gc');

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const constructed = graph.providers.filter((p) => p.kind !== 'value').length;

const collect = () => {
  globalThis.gc();
  globalThis.gc();
};

const ns = () => process.hrtime.bigint();

// Library import time is the cold-start figure, so it stays untimed.
for (const spec of packages) await import(spec);

collect();
const base = retainedHeap(getHeapSpaceStatistics());

let t = ns();
const { scale } = await import(pathToFileURL(bundle).href);
const load = Number(ns() - t);
if (scale === undefined) fail('the bundle exports no scale app');

collect();
t = ns();
const handle = await scale.create();
const create = Number(ns() - t);

collect();
const others = [];
for (let i = 0; i < scale.count; i++) if (i !== scale.target) others.push(i);

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

collect();
const heapReady = retainedHeap(getHeapSpaceStatistics()) - base;
// The handle must still be reachable at the heap read above.
globalThis.__scaleHandle = handle;

const total = scale.built.counts.reduce((sum, c) => sum + c, 0);
if (total !== constructed)
  fail(`construction count ${total}, expected ${constructed}`);

process.send({ type: 'sample', load, create, firstGet, rest, heapReady });
process.disconnect();
