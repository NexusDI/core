import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createProjectGraphAsync, parseJson, workspaceRoot } from '@nx/devkit';
import { findMatchingProjects } from 'nx/src/devkit-internals';
import { describe, expect, it } from 'vitest';

/**
 * Every released library writes its coverage to the same place.
 *
 * `/coverage` in `.gitignore` is anchored at the repository root, on the
 * assumption that every project writes to its own
 * `<project>/test-output/vitest/coverage`. A package with no `coverage`
 * block at all falls back to Vitest's default `reportsDirectory`, which
 * `.gitignore` does not reach and a `git status` after a local test run
 * then shows as untracked.
 *
 * The configuration is read as text rather than loaded through Vite's own
 * config loader: loading it needs a plugin resolution per package for a
 * three-line assertion about a literal that is in the file either way.
 */

const REPORTS_DIRECTORY = "reportsDirectory: './test-output/vitest/coverage'";

/** The libraries `nx release` versions, resolved the way `nx.json` states it. */
const released = (async () => {
  const nxJson = parseJson<{ release?: { projects?: string | string[] } }>(
    readFileSync(join(workspaceRoot, 'nx.json'), 'utf-8'),
    { expectComments: true },
  );
  const patterns = nxJson.release?.projects;

  if (!patterns) throw new Error('nx.json must define release.projects');

  const graph = await createProjectGraphAsync({ exitOnError: false });

  return findMatchingProjects(
    Array.isArray(patterns) ? patterns : [patterns],
    graph.nodes,
  ).map((name) => ({ name, root: graph.nodes[name]?.data.root ?? '' }));
})();

describe('a library coverage configuration', () => {
  it('writes its report where the repository ignores it', async () => {
    const projects = await released;

    expect(projects.length).toBeGreaterThan(0);

    const wrong = projects
      .filter((project) => {
        const config = readFileSync(
          join(workspaceRoot, project.root, 'vite.config.ts'),
          'utf8',
        );

        return !config.includes(REPORTS_DIRECTORY);
      })
      .map((project) => project.name);

    expect(
      wrong.sort(),
      `Each of these needs a test.coverage block with ${REPORTS_DIRECTORY}. ` +
        'Without it Vitest writes to <project>/coverage, which .gitignore does ' +
        'not reach.',
    ).toEqual([]);
  });
});
