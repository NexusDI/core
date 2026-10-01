// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  compareVersions,
  inCandidacy,
  readReleaseState,
  releaseNotice,
} from './release-state';

const repos: string[] = [];

/** A throwaway repository with one empty commit and the given tags. */
function repoWith(tags: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexusdi-release-state-'));
  repos.push(dir);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('commit', '-q', '--allow-empty', '-m', 'first');
  for (const tag of tags) git('tag', tag);
  return dir;
}

afterEach(() => {
  for (const dir of repos.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('compareVersions', () => {
  it('orders releases, prereleases and numeric identifiers', () => {
    expect(compareVersions('0.4.0-rc.0', '0.3.1')).toBeGreaterThan(0);
    expect(compareVersions('0.4.0', '0.4.0-rc.9')).toBeGreaterThan(0);
    expect(compareVersions('0.4.0-rc.10', '0.4.0-rc.2')).toBeGreaterThan(0);
    expect(compareVersions('0.3.1', '0.3.1')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
  });
});

describe('readReleaseState', () => {
  it('reads the newest stable tag when no RC exists', () => {
    const dir = repoWith(['@nexusdi/core@0.3.0', '@nexusdi/core@0.3.1']);
    expect(readReleaseState(dir)).toEqual({ stable: '0.3.1', rc: null });
  });

  it('reads the newest RC beside the newest stable tag', () => {
    const dir = repoWith([
      '@nexusdi/core@0.3.1',
      '@nexusdi/core@0.4.0-rc.0',
      '@nexusdi/core@0.4.0-rc.2',
      '@nexusdi/other@9.0.0',
    ]);
    expect(readReleaseState(dir)).toEqual({
      stable: '0.3.1',
      rc: '0.4.0-rc.2',
    });
  });

  it('reports nothing for a repository without tags', () => {
    expect(readReleaseState(repoWith([]))).toEqual({ stable: null, rc: null });
  });

  it('reports nothing outside a repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexusdi-no-repo-'));
    repos.push(dir);
    expect(readReleaseState(dir)).toEqual({ stable: null, rc: null });
  });
});

describe('releaseNotice', () => {
  it('names the line, the newest RC and the current release during the RC', () => {
    expect(releaseNotice({ stable: '0.3.2', rc: '0.4.0-rc.2' }, 'next')).toBe(
      'This page documents the 0.4 release candidates of `@nexusdi/core`. The newest on npm is 0.4.0-rc.2. The documentation for 0.3.2, the current release, is at nexus.js.org.',
    );
  });

  it('says the page documents the line ahead of the release when no RC is newer', () => {
    const expected =
      'This page documents `@nexusdi/core` ahead of 0.4.0, the current release. The documentation for 0.4.0 is at nexus.js.org.';
    expect(releaseNotice({ stable: '0.4.0', rc: '0.4.0-rc.3' }, 'next')).toBe(
      expected,
    );
    expect(releaseNotice({ stable: '0.4.0', rc: null }, 'next')).toBe(expected);
  });

  it('carries no notice on the release channel', () => {
    expect(releaseNotice({ stable: '0.4.0', rc: null }, 'release')).toBeNull();
  });

  it('names the package alone when nothing has been released', () => {
    expect(releaseNotice({ stable: null, rc: null }, 'next')).toBe(
      'This page documents `@nexusdi/core`, which has no release yet.',
    );
  });
});

describe('inCandidacy', () => {
  it('holds while an RC is newer than the newest release', () => {
    expect(inCandidacy({ stable: '0.3.2', rc: '0.4.0-rc.0' })).toBe(true);
    expect(inCandidacy({ stable: '0.4.0', rc: '0.4.0-rc.3' })).toBe(false);
    expect(inCandidacy({ stable: '0.4.0', rc: null })).toBe(false);
  });
});
