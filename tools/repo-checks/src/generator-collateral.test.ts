import { parseJson, workspaceRoot } from '@nx/devkit';
import { findNodeAtLocation, parseTree, visit } from 'jsonc-parser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nx generators write root config through devkit's `writeJson`, which is
 * `JSON.stringify` over the parsed object
 * (nx/src/generators/utils/json.js -> nx/src/utils/json.js). Reads are
 * comment-tolerant, writes are not, so any generator that touches nx.json
 * rewrites the whole file without its comments. There is no Nx option that
 * changes this.
 *
 * `@nx/js:library --publishable` additionally sets
 * `release.version.preVersionCommand` and runs the setup-verdaccio generator
 * unconditionally (@nx/js/src/generators/library/utils/add-release-config.js),
 * which adds a `verdaccio` devDependency, a `local-registry` target and
 * `.verdaccio/config.yml`. This workspace publishes from CI and runs no local
 * registry, so none of that belongs here.
 *
 * The collateral lands in files nobody diffs after scaffolding, so these
 * assertions pin exactly the parts generators write and nothing else --
 * editing nx.json by hand does not trip them.
 */

const nxJsonPath = join(workspaceRoot, 'nx.json');

function readNxJsonSource(): string {
  return readFileSync(nxJsonPath, 'utf-8');
}

/** Offsets of every `//` or block comment in a JSONC document. */
function commentOffsets(source: string): number[] {
  const offsets: number[] = [];
  visit(source, { onComment: (offset) => void offsets.push(offset) });
  return offsets;
}

describe('nx.json survives generator runs', () => {
  it('keeps the comments in its release block', () => {
    const source = readNxJsonSource();
    const root = parseTree(source);

    if (!root) {
      throw new Error('nx.json did not parse as JSONC');
    }

    const release = findNodeAtLocation(root, ['release']);

    if (!release) {
      throw new Error('nx.json must define a release block');
    }

    const { offset, length } = release;
    const inRelease = commentOffsets(source).filter(
      (at) => at >= offset && at < offset + length,
    );

    expect(
      inRelease.length,
      `The release block in nx.json has lost its comments. They document why ` +
        `useCommitScope is set the way it is, and an Nx generator write is ` +
        `what removes them. Restore nx.json from git and re-apply by hand ` +
        `only the part the generator legitimately added.`,
    ).toBeGreaterThan(0);
  });

  it('declares no preVersionCommand', () => {
    const nxJson = parseJson<{
      release?: { version?: Record<string, unknown> };
    }>(readNxJsonSource(), { expectComments: true });

    expect(
      nxJson.release?.version,
      `nx.json gained release.version.preVersionCommand. A publishable-library ` +
        `generator adds it unasked and it changes release behaviour. Remove it. ` +
        `The release workflow's own Verify step already builds before nx release runs.`,
    ).not.toHaveProperty('preVersionCommand');
  });
});

describe('the workspace runs no local npm registry', () => {
  const packageJson = parseJson<{
    nx?: { targets?: Record<string, unknown> };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(readFileSync(join(workspaceRoot, 'package.json'), 'utf-8'));

  it('has no verdaccio dependency', () => {
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(
      dependencies,
      `verdaccio was added to root package.json. The setup-verdaccio generator ` +
        `runs as part of scaffolding a publishable library; this workspace ` +
        `publishes from CI and has no use for it.`,
    ).not.toHaveProperty('verdaccio');
  });

  it('has no local-registry target', () => {
    expect(
      packageJson.nx?.targets ?? {},
      `A local-registry target was added to root package.json by the ` +
        `setup-verdaccio generator. Remove it.`,
    ).not.toHaveProperty('local-registry');
  });

  it('has no .verdaccio config', () => {
    expect(
      existsSync(join(workspaceRoot, '.verdaccio')),
      `.verdaccio/ was scaffolded by the setup-verdaccio generator. Delete it.`,
    ).toBe(false);
  });
});
