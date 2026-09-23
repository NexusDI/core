#!/usr/bin/env node
// Resolves the release workflow's free-text `projects` input against the
// project graph, and writes two lists to $GITHUB_OUTPUT: `projects`, the set to
// release, and `verify-projects`, the set to run the verify gate over.
//
// Both `nx release` and `nx release publish` read that one output rather than
// the raw input, so the set that gets versioned and the set that gets published
// cannot drift apart.
//
// An unmatched name exits non-zero before either command runs, and the error
// lists what is releasable. Nx reports a filter matching nothing as "please
// report this as a bug", which is the right message for an Nx bug and the wrong
// one for a typo in a workflow input.

import { createProjectGraphAsync, parseJson, workspaceRoot } from '@nx/devkit';
import { findMatchingProjects } from 'nx/src/devkit-internals';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Writes a `key=value` line to $GITHUB_OUTPUT, or to stdout when run locally. */
function writeOutput(key, value) {
  const line = `${key}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, line);
  } else {
    process.stdout.write(line);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Every project reachable from `seeds` by following `edges`, seeds included.
 */
function closure(seeds, edges) {
  const reached = new Set(seeds);
  const queue = [...seeds];

  while (queue.length > 0) {
    for (const next of edges.get(queue.pop()) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  return reached;
}

/**
 * The projects the verify gate has to cover for a release of `released`.
 *
 * Three groups, and each is in the published artifact's blast radius:
 *
 * - the released packages themselves;
 * - what they depend on, because the tarball is compiled against that source
 *   and carries its types;
 * - what depends on them, transitively. `version.updateDependents` is `always`,
 *   so a dependent is versioned and republished by the same run whether or not
 *   the input named it, and a dependent outside `libs/` is the thing a broken
 *   release breaks first.
 *
 * A dependent's own unrelated dependencies are outside all three. Nx still
 * builds them, because `build` orders `^build` ahead of itself, so a dependent
 * that cannot compile is red here either way.
 */
function verifyScope(released, graph) {
  const dependencies = new Map();
  const dependents = new Map();

  for (const [source, edges] of Object.entries(graph.dependencies)) {
    for (const { target } of edges) {
      // `dependencies` also carries edges to npm packages, which are nodes in
      // `externalNodes` and have no targets to run.
      if (!graph.nodes[target]) continue;

      if (!dependencies.has(source)) dependencies.set(source, new Set());
      dependencies.get(source).add(target);

      if (!dependents.has(target)) dependents.set(target, new Set());
      dependents.get(target).add(source);
    }
  }

  return [
    ...new Set([
      ...closure(released, dependencies),
      ...closure(released, dependents),
    ]),
  ].sort();
}

const raw = (process.env.PROJECTS ?? '').trim();

// An empty input is the default: release everything nx finds affected. The
// workflow omits `--projects` entirely in that case, because `--projects ""` is
// a filter matching nothing. The verify gate is unscoped for the same reason and
// for one more: the release set is decided later, by `nx release` reading
// conventional commits, so nothing here knows what to scope to.
if (!raw) {
  writeOutput('projects', '');
  writeOutput('verify-projects', '');
  process.exit(0);
}

const requested = [
  ...new Set(
    raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  ),
];

if (requested.length === 0) {
  fail(
    `The 'projects' input was ${JSON.stringify(raw)} and named no projects.`,
  );
}

// nx.json carries `//` comments, so it needs the comment-tolerant parser nx
// itself reads it with; `JSON.parse` throws on it.
const nxJson = parseJson(
  readFileSync(join(workspaceRoot, 'nx.json'), 'utf-8'),
  {
    expectComments: true,
  },
);

const patterns = nxJson.release?.projects;
if (!patterns) {
  fail('nx.json defines no release.projects, so nothing here is releasable.');
}

const graph = await createProjectGraphAsync({ exitOnError: false });
const releasable = findMatchingProjects(
  Array.isArray(patterns) ? patterns : [patterns],
  graph.nodes,
);

if (releasable.length === 0) {
  fail(
    'release.projects matched no projects -- the globs or the graph are wrong.',
  );
}

// Project names carry an npm scope; commit scopes and everyday usage do not.
// Accepting both means the input takes the same vocabulary as a commit message.
// The bare form is derived from the graph rather than from a hard-coded scope,
// so a package published under a different scope needs no change here.
const byBareName = new Map();
for (const name of releasable) {
  byBareName.set(name.replace(/^@[^/]+\//, ''), name);
}

const resolved = [];
const unknown = [];
for (const name of requested) {
  const match = releasable.includes(name) ? name : byBareName.get(name);
  if (match) resolved.push(match);
  else unknown.push(name);
}

if (unknown.length > 0) {
  fail(
    `The 'projects' input names ${unknown.length === 1 ? 'a project' : 'projects'} ` +
      `this repository does not release: ${unknown.join(', ')}\n` +
      `Releasable: ${[...byBareName.keys()].sort().join(', ')}`,
  );
}

console.log(`Releasing ${resolved.length} of ${releasable.length} projects:`);
for (const name of resolved) console.log(`  ${name}`);

const verify = verifyScope(resolved, graph);

const total = Object.keys(graph.nodes).length;
console.log(`\nVerifying ${verify.length} of ${total} projects:`);
for (const name of verify) console.log(`  ${name}`);

writeOutput('projects', resolved.join(','));
writeOutput('verify-projects', verify.join(','));
