// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pickNextSource } from './next-source.mjs';

const sha = (n) => String(n).repeat(40);
const heads = (...branches) =>
  branches
    .map(([branch, n]) => `${sha(n)}\trefs/heads/${branch}`)
    .join('\n')
    .concat('\n');

describe('pickNextSource', () => {
  it('picks main when no release branch exists', () => {
    expect(pickNextSource('', () => true)).toEqual({
      branch: 'main',
      sha: null,
    });
  });

  it('picks the highest release branch ahead of main, comparing numerically', () => {
    const asked = [];
    const pick = pickNextSource(
      heads(['release/0.9', 1], ['release/0.10', 2], ['release/0.4', 3]),
      (candidate) => {
        asked.push(candidate);
        return true;
      },
    );
    expect(pick).toEqual({ branch: 'release/0.10', sha: sha(2) });
    expect(asked).toEqual([sha(2)]);
  });

  it('skips a release branch main has caught up with', () => {
    const asked = [];
    const pick = pickNextSource(
      heads(['release/0.4', 1], ['release/0.5', 2]),
      (candidate) => {
        asked.push(candidate);
        return candidate === sha(1);
      },
    );
    expect(pick).toEqual({ branch: 'release/0.4', sha: sha(1) });
    expect(asked).toEqual([sha(2), sha(1)]);
  });

  it('picks main when every release branch is merged', () => {
    expect(pickNextSource(heads(['release/0.4', 1]), () => false)).toEqual({
      branch: 'main',
      sha: null,
    });
  });

  it('ignores branches outside release/X.Y', () => {
    const asked = [];
    const pick = pickNextSource(
      heads(
        ['release/1.0-beta', 1],
        ['release/1.0/hotfix', 2],
        ['release/next', 3],
        ['release/0.4', 4],
      ),
      (candidate) => {
        asked.push(candidate);
        return true;
      },
    );
    expect(pick).toEqual({ branch: 'release/0.4', sha: sha(4) });
    expect(asked).toEqual([sha(4)]);
  });
});

const CLI = join(import.meta.dirname, 'next-source.mjs');
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * A clone of a bare origin with main, a merged release/0.3 and a
 * release/0.4 one commit ahead of main.
 */
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'next-source-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', origin, work);
  git(work, 'commit', '--allow-empty', '-m', 'main');
  git(work, 'push', 'origin', 'HEAD:main', 'HEAD:release/0.3');
  git(work, 'commit', '--allow-empty', '-m', 'rc');
  const release = git(work, 'rev-parse', 'HEAD');
  git(work, 'push', 'origin', 'HEAD:release/0.4');
  git(work, 'reset', '--hard', 'origin/main');
  git(work, 'fetch', 'origin');
  return { work, release, main: git(work, 'rev-parse', 'HEAD') };
}

describe('next-source.mjs CLI', () => {
  it('writes the picked branch and commit as step outputs', () => {
    const { work, release } = repository();
    const output = join(work, '..', 'github-output');
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [CLI], {
      cwd: work,
      env: { ...GIT_ENV, GITHUB_OUTPUT: output },
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `/next/ builds from release/0.4 at ${release}`,
    );
    expect(readFileSync(output, 'utf8')).toBe(
      `ref=release/0.4\nsha=${release}\nis_main=false\n`,
    );
  });

  it('writes main and the checked-out commit when no release branch is ahead', () => {
    const { work, main } = repository();
    git(work, 'push', 'origin', '--delete', 'release/0.4');
    const output = join(work, '..', 'github-output');
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [CLI], {
      cwd: work,
      env: { ...GIT_ENV, GITHUB_OUTPUT: output },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      `ref=main\nsha=${main}\nis_main=true\n`,
    );
  });
});
