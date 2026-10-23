import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The husky runner under .husky/_ is committed, so every worktree has hooks
 * from the moment git checks it out.
 *
 * `npm ci` runs husky, which sets core.hooksPath to the relative path
 * `.husky/_` and writes that directory. All worktrees share the one
 * core.hooksPath, and git resolves it against each worktree's root. A worktree
 * from `git worktree add` therefore had no hooks until someone ran `npm ci` in
 * it, and git committed there without commitlint or the lint pre-commit and
 * printed nothing.
 *
 * The committed files must be exactly what the installed husky writes. A
 * file that differs is left modified by `npm ci`. A stub husky writes and git
 * does not track outlives a checkout of a branch from before this commit,
 * which deletes the tracked runner `h`, and every hook that stub serves then
 * fails.
 */

// husky.sh is a deprecation shim husky still writes. No stub sources it.
const untracked = new Set(['husky.sh']);

function withoutHusky(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const rest = { ...env };
  delete rest.HUSKY;
  return rest;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * Runs the installed husky in a scratch repository and returns the repository.
 *
 * husky skips the install when HUSKY=0, and the release workflow sets that for
 * the whole job, so the child gets the environment without it.
 */
function install(env: NodeJS.ProcessEnv = process.env): string {
  const scratch = mkdtempSync(join(tmpdir(), 'husky-'));
  git(scratch, 'init', '--quiet');
  const husky = pathToFileURL(createRequire(import.meta.url).resolve('husky'));
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import i from '${husky.href}'; process.stdout.write(i())`,
    ],
    { cwd: scratch, encoding: 'utf-8', env: withoutHusky(env) },
  );
  expect(result, 'husky refused to install').toBe('');
  return scratch;
}

const scratch = install();
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const generated = readdirSync(join(scratch, '.husky/_')).filter(
  (name) => !untracked.has(name),
);

const tracked = git(workspaceRoot, 'ls-files', '-s', '--', '.husky/_')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => {
    const [mode, , , path] = line.split(/\s+/);
    return { mode, name: path.slice('.husky/_/'.length) };
  });

describe('.husky/_', () => {
  it('installs husky when HUSKY=0 is set, as in the release workflow', () => {
    const repo = install({ ...process.env, HUSKY: '0' });
    try {
      expect(readdirSync(join(repo, '.husky/_'))).toContain('h');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('finds tracked files under .husky/_', () => {
    expect(tracked.length, 'git tracks nothing under .husky/_').toBeGreaterThan(
      0,
    );
  });

  it('tracks every file the installed husky writes, and nothing else', () => {
    expect(tracked.map((file) => file.name).sort()).toEqual(generated.sort());
  });

  it.each(generated)('tracks %s as husky writes it', (name) => {
    const path = join(scratch, '.husky/_', name);
    const executable = (statSync(path).mode & 0o100) !== 0;
    expect(
      tracked.find((file) => file.name === name)?.mode,
      `.husky/_/${name} has the wrong mode`,
    ).toBe(executable ? '100755' : '100644');
    expect(
      git(workspaceRoot, 'show', `:.husky/_/${name}`),
      `.husky/_/${name} differs from what husky writes: run \`npx husky\` and commit .husky/_`,
    ).toBe(readFileSync(path, 'utf-8'));
  });
});
