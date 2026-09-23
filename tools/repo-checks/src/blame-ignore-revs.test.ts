import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * Every SHA in .git-blame-ignore-revs resolves to a commit in this repository.
 *
 * Git skips an entry it cannot resolve and reports nothing, so a SHA that is
 * wrong behaves exactly like a file that is absent: blame keeps pointing at the
 * formatting sweep, and the file that was supposed to fix that looks correct.
 * This repository merges by rebase, which is how a wrong SHA gets in -- a
 * pull request's commit is renamed when it lands.
 */

const file = '.git-blame-ignore-revs';

function entries(): string[] {
  const contents = readFileSync(join(workspaceRoot, file), 'utf-8');
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe(file, () => {
  it('lists at least one commit', () => {
    expect(
      entries().length,
      `${file} has a header and no commits, so it does nothing`,
    ).toBeGreaterThan(0);
  });

  it('gives each commit as a full 40-character SHA', () => {
    // Git resolves an abbreviation here, but an abbreviation stops being unique
    // as the repository grows, and the entry then silently stops applying.
    for (const entry of entries()) {
      expect(entry, `${file}: ${entry} is not a full SHA`).toMatch(
        /^[0-9a-f]{40}$/,
      );
    }
  });

  it('resolves every commit it lists', () => {
    for (const entry of entries()) {
      expect(() =>
        execFileSync('git', ['cat-file', '-e', `${entry}^{commit}`], {
          cwd: workspaceRoot,
          stdio: 'pipe',
        }),
      ).not.toThrow();
    }
  });
});
