/**
 * The dotted figure paths of benchmarks spec §4.9, resolved against
 * `generated/benchmark-data.json`. The components and the
 * `doc-benchmark-figures` guard share this file, so a path that renders is a
 * path the guard accepts.
 */

const FAMILIES = ['matrix', 'probes', 'size', 'emit', 'timings', 'build'];

const BYTES = new Set([
  'minified',
  'gzip',
  'polyfillGzip',
  'emittedBytes',
  'heapBytes',
]);
const STATS = new Set(['median', 'mad', 'p5', 'p95']);

/**
 * The value at `path`, and the record that holds it. `run` names a timings
 * file by its stem; without it a timings path reads the newest. Throws a
 * sentence that names the path and the fix, so `next build` fails on it.
 */
export function lookup(data, path, run) {
  const [family = '', ...keys] = path.split('.');
  if (!FAMILIES.includes(family)) {
    throw new Error(
      `"${path}" starts with '${family}', which is no results family. A path starts with ${FAMILIES.join(', ')} (benchmarks spec section 4.9).`,
    );
  }
  if (run !== undefined && family !== 'timings') {
    throw new Error(
      `"${path}" takes no run: run names a file in benchmarks/results/timings/, and only a timings path reads one.`,
    );
  }
  let node =
    family === 'timings' ? data.timings[run ?? data.newest] : data[family];
  if (node === undefined) {
    throw new Error(
      `run "${run}" names no file in benchmarks/results/timings/. The files are ${Object.keys(data.timings).join(', ')}.`,
    );
  }
  let parent = node;
  for (const [at, key] of keys.entries()) {
    if (typeof node !== 'object' || node === null || !(key in node)) {
      throw new Error(
        `"${path}": benchmarks/results holds no '${[family, ...keys.slice(0, at + 1)].join('.')}'. Name a ${family} entry the results file holds.`,
      );
    }
    parent = node;
    node = node[key];
  }
  if (typeof node === 'object' && node !== null) {
    throw new Error(
      `"${path}" names a record that holds several figures. Add one of its fields: ${Object.keys(node).join(', ')}.`,
    );
  }
  return { value: node, record: parent };
}

/** The unit a path's figure carries. */
export function unitOf(path) {
  const keys = path.split('.');
  const field = keys.at(-1) ?? '';
  if (keys.includes('vsNexus')) return 'ratio';
  if (BYTES.has(field)) return 'bytes';
  if (STATS.has(field)) return keys[0] === 'build' ? 'ms' : 'ns';
  return 'plain';
}
