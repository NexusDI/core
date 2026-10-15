import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { isFixture, localPaths } from './fixture-local-paths.js';

describe('isFixture', () => {
  it('takes files under a fixtures folder, recorded profiles and golden files', () => {
    expect(isFixture('libs/devtools/test-fixtures/profile/a.json')).toBe(true);
    expect(isFixture('tools/repo-checks/src/__fixtures__/x/y.ts')).toBe(true);
    expect(isFixture('apps/docs/fixtures/page.md')).toBe(true);
    expect(isFixture('somewhere/node.cpuprofile')).toBe(true);
    expect(isFixture('libs/x/src/trace.golden.json')).toBe(true);
    expect(isFixture('libs/devtools/src/profile/chrome.ts')).toBe(false);
  });
});

describe('localPaths', () => {
  it('names each fixture that holds a path from a developer machine', () => {
    // The paths are built here: a committed sabotaged fixture would fail the
    // live test below.
    const home = ['', 'Users', 'someone', 'code', 'a.js'].join('/');
    const volume = ['file://', 'Volumes', 'disk', 'repo', 'b.js'].join('/');
    const linux = ['', 'home', 'ci', 'repo', 'c.js'].join('/');
    const windows = ['C:', 'Users', 'someone', 'd.js'].join('\\\\');
    const worktree = ['repo', '.claude', 'worktrees', 'x', 'e.js'].join('/');
    expect(
      localPaths([
        { path: 'a.cpuprofile', text: `{"url":"file://${home}"}` },
        { path: 'b.json', text: volume },
        { path: 'c.json', text: linux },
        { path: 'd.json', text: windows },
        { path: 'e.json', text: worktree },
        { path: 'f.json', text: '{"url":"file:///app/node_modules/x.js"}' },
      ]),
    ).toEqual([
      'a.cpuprofile holds /Users/someone',
      'b.json holds /Volumes/disk',
      'c.json holds /home/ci',
      'd.json holds C:\\\\Users\\\\someone',
      'e.json holds .claude/worktrees',
    ]);
  });
});

describe('the committed fixtures', () => {
  it('hold no path from a developer machine; rewrite one to file:///app/', () => {
    const files = execFileSync('git', ['ls-files', '-z'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    })
      .split('\0')
      .filter((path) => path !== '' && isFixture(path))
      .map((path) => ({
        path,
        text: readFileSync(join(workspaceRoot, path), 'utf8'),
      }));
    expect(files.length).toBeGreaterThan(0);
    expect(localPaths(files)).toEqual([]);
  });
});
