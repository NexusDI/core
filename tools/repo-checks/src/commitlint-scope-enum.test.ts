import { createProjectGraphAsync, parseJson, workspaceRoot } from '@nx/devkit';
import { findMatchingProjects } from 'nx/src/devkit-internals';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The invariant: every project nx.json releases has a matching entry in
 * commitlint's `scope-enum`, under the bare name Nx resolves a commit scope to.
 *
 * `nx release` matches conventional-commit scopes against Nx project names
 * (`getCommitsRelevantToProjects` in
 * nx/src/command-line/release/utils/shared.js). A scope matching no project is
 * not an error: semver.js attributes the commit to nothing and the bump falls
 * back to `patch`, so `feat(x)!:` with a typo'd scope ships as a patch release
 * with an empty Breaking Changes section.
 *
 * `scope-enum` is what turns that into an error, and it has to be a static list
 * because it runs in the commit-msg hook on every commit and cannot afford a
 * project-graph computation. This test is the dynamic half: it fails when a
 * releasable project exists with no scope to name it in a commit.
 */

const require_ = createRequire(import.meta.url);

interface CommitlintConfig {
  rules: Record<string, unknown>;
}

function readScopeEnum(): string[] {
  const config = require_(
    join(workspaceRoot, 'commitlint.config.js'),
  ) as CommitlintConfig;
  const rule = config.rules['scope-enum'];

  expect(
    rule,
    'commitlint.config.js must define a scope-enum rule',
  ).toBeDefined();

  const [level, applicable, scopes] = rule as [number, string, string[]];
  expect(level, 'scope-enum must be an error, not a warning').toBe(2);
  expect(applicable).toBe('always');
  expect(Array.isArray(scopes)).toBe(true);

  return scopes;
}

/**
 * nx.json carries `//` comments, so it is read with the same comment-tolerant
 * parser Nx itself reads it with. `JSON.parse` throws on it.
 */
function readReleaseProjectPatterns(): string[] {
  const nxJson = parseJson<{ release?: { projects?: string | string[] } }>(
    readFileSync(join(workspaceRoot, 'nx.json'), 'utf-8'),
    { expectComments: true },
  );
  const patterns = nxJson.release?.projects;

  expect(patterns, 'nx.json must define release.projects').toBeDefined();

  return Array.isArray(patterns) ? patterns : [patterns as string];
}

/**
 * `@nexusdi/core` -> `core`.
 *
 * A commit scope that is not a literal project name is matched against the
 * project names with the word-boundary regex in `addMatchingProjectsByName`
 * (nx/src/utils/find-matching-projects.js), where `@` and `-` both count as
 * word characters. A bare name therefore matches its own scoped project and
 * nothing else.
 */
function bareName(projectName: string): string {
  return projectName.replace(/^@[^/]+\//, '');
}

describe('commitlint scope-enum', () => {
  it('covers every project nx.json releases', async () => {
    const projectGraph = await createProjectGraphAsync({ exitOnError: false });
    const releaseProjects = findMatchingProjects(
      readReleaseProjectPatterns(),
      projectGraph.nodes,
    );

    expect(
      releaseProjects.length,
      'release.projects matched no projects -- the globs or the graph are wrong',
    ).toBeGreaterThan(0);

    const scopes = readScopeEnum();
    const missing = releaseProjects
      .map(bareName)
      .filter((name) => !scopes.includes(name))
      .sort();

    expect(
      missing,
      `Add these to 'scope-enum' in commitlint.config.js and to the Scopes ` +
        `section of CONTRIBUTING.md. A releasable project with no matching ` +
        `scope gets patch-bumped instead of erroring.`,
    ).toEqual([]);
  });

  it('has no duplicate entries', () => {
    const scopes = readScopeEnum();
    expect(scopes).toEqual([...new Set(scopes)]);
  });

  it('lists no scope carrying the @nexusdi/ prefix', () => {
    // One spelling per project. Nx resolves both forms, so a list holding the
    // prefixed one as well would let two different scopes release the same
    // project, and this test's bare-name comparison would stop covering it.
    expect(readScopeEnum().filter((scope) => scope.includes('/'))).toEqual([]);
  });
});
