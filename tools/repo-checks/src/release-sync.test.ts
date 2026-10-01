import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  mergeManifests,
  restoreWorkspacePins,
  settleReadme,
} from '@nexusdi/release';

/**
 * A sync merges main into release/X.Y (release spec section 5.3). main's
 * release commits move every package to main's version, and the line must
 * keep its own. These hold the two manifest helpers tools/release/sync.mjs
 * runs on every libs/*\/package.json.
 */

const NAMES = ['@nexusdi/core', '@nexusdi/errors'];

describe('restoreWorkspacePins', () => {
  it('puts back the line version and every in-workspace pin, and keeps the rest of the merge', () => {
    const merged = {
      name: '@nexusdi/errors',
      version: '0.3.3',
      dependencies: { '@nexusdi/core': '0.3.3', tslib: '^2.8.1' },
      peerDependencies: { '@nexusdi/core': '0.3.3' },
      description: 'from main',
    };
    const ours = {
      name: '@nexusdi/errors',
      version: '0.4.0-rc.1',
      dependencies: { '@nexusdi/core': '0.4.0-rc.1', tslib: '^2.6.0' },
      peerDependencies: { '@nexusdi/core': '0.4.0-rc.1' },
      description: 'from the line',
    };

    expect(restoreWorkspacePins(merged, ours, NAMES, '0.4.0-rc.1')).toEqual({
      name: '@nexusdi/errors',
      version: '0.4.0-rc.1',
      dependencies: { '@nexusdi/core': '0.4.0-rc.1', tslib: '^2.8.1' },
      peerDependencies: { '@nexusdi/core': '0.4.0-rc.1' },
      description: 'from main',
    });
  });

  it('pins a workspace dependency only main added to the line version', () => {
    const merged = {
      version: '0.3.3',
      devDependencies: { '@nexusdi/core': '0.3.3' },
    };
    const ours = { version: '0.4.0' };
    expect(restoreWorkspacePins(merged, ours, NAMES, '0.4.0')).toEqual({
      version: '0.4.0',
      devDependencies: { '@nexusdi/core': '0.4.0' },
    });
  });

  it('gives a manifest only main has the line version and pins', () => {
    const merged = {
      name: '@nexusdi/errors',
      version: '0.3.3',
      dependencies: { '@nexusdi/core': '0.3.3', tslib: '^2.8.1' },
    };
    expect(restoreWorkspacePins(merged, null, NAMES, '0.4.0-rc.1')).toEqual({
      name: '@nexusdi/errors',
      version: '0.4.0-rc.1',
      dependencies: { '@nexusdi/core': '0.4.0-rc.1', tslib: '^2.8.1' },
    });
  });
});

describe('mergeManifests', () => {
  it('takes each side change by key and reports a key both sides changed differently', () => {
    const base = {
      version: '0.3.2',
      description: 'a',
      keywords: ['di'],
      files: ['dist'],
    };
    const ours = {
      version: '0.4.0-rc.0',
      description: 'a',
      keywords: ['di', 'async'],
      files: ['dist'],
    };
    const theirs = {
      version: '0.3.3',
      description: 'b',
      keywords: ['di'],
      files: ['dist', 'README.md'],
    };

    expect(mergeManifests(base, ours, theirs)).toEqual({
      result: {
        version: '0.4.0-rc.0',
        description: 'b',
        keywords: ['di', 'async'],
        files: ['dist', 'README.md'],
      },
      conflicts: ['version'],
    });
  });

  it('merges nested objects key by key', () => {
    const base = { dependencies: { a: '1', b: '1' } };
    const ours = { dependencies: { a: '2', b: '1' } };
    const theirs = { dependencies: { a: '1', b: '3', c: '1' } };
    expect(mergeManifests(base, ours, theirs)).toEqual({
      result: { dependencies: { a: '2', b: '3', c: '1' } },
      conflicts: [],
    });
  });

  it('drops a key one side deleted and the other left alone', () => {
    const base = { a: 1, b: 2 };
    expect(mergeManifests(base, { a: 1 }, { a: 1, b: 2 })).toEqual({
      result: { a: 1 },
      conflicts: [],
    });
  });
});

describe('settleReadme', () => {
  /** The three-way merge sync.mjs runs, `git merge-file -p`, on temp files. */
  function merge3(base: string, ours: string, theirs: string): string | null {
    const dir = mkdtempSync(join(tmpdir(), 'settle-readme-'));
    try {
      const files = { base, ours, theirs };
      for (const [name, text] of Object.entries(files))
        writeFileSync(join(dir, name), text);
      return execFileSync(
        'git',
        ['merge-file', '-p', 'ours', 'base', 'theirs'],
        { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      return null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const TREE = 'https://github.com/NexusDI/core/tree/@nexusdi/core@';
  const readme = (version: string, intro = 'Intro.') =>
    `# @nexusdi/errors\n\n${intro}\n\n- [Examples](${TREE}${version}/libs/errors/docs)\n`;

  it('resolves a conflict where both sides changed only the pinned version', () => {
    const stages: [string, string, string] = [
      readme('0.3.2'),
      readme('0.4.0-rc.1'),
      readme('0.3.3'),
    ];
    expect(
      settleReadme({
        current: '<<<<<<< conflict markers',
        stages,
        lineVersion: '0.4.0-rc.1',
        merge3,
      }),
    ).toBe(readme('0.4.0-rc.1'));
  });

  it("keeps main's text change and the line's version", () => {
    const stages: [string, string, string] = [
      readme('0.3.2'),
      readme('0.4.0-rc.1'),
      readme('0.3.3', 'A clearer intro.'),
    ];
    expect(
      settleReadme({
        current: '',
        stages,
        lineVersion: '0.4.0-rc.1',
        merge3,
      }),
    ).toBe(readme('0.4.0-rc.1', 'A clearer intro.'));
  });

  it('leaves a real text conflict for a person', () => {
    const stages: [string, string, string] = [
      readme('0.3.2'),
      readme('0.4.0-rc.1', 'The line says this.'),
      readme('0.3.3', 'main says that.'),
    ];
    expect(
      settleReadme({
        current: '',
        stages,
        lineVersion: '0.4.0-rc.1',
        merge3,
      }),
    ).toBeNull();
  });

  it('leaves a README one side deleted for a person', () => {
    expect(
      settleReadme({
        current: '',
        stages: [readme('0.3.2'), null, readme('0.3.3')],
        lineVersion: '0.4.0-rc.1',
        merge3,
      }),
    ).toBeNull();
  });

  it("re-pins a README git merged cleanly from main's version to the line's", () => {
    expect(
      settleReadme({
        current: readme('0.4.1'),
        stages: null,
        lineVersion: '0.5.0-rc.2',
        merge3,
      }),
    ).toBe(readme('0.5.0-rc.2'));
  });
});

describe('sync.mjs restore', () => {
  it('writes a README whose conflict was the version alone with its trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sync-restore-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    const write = (path: string, text: string) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    const TREE = 'https://github.com/NexusDI/core/tree/@nexusdi/core@';
    const readme = (version: string) =>
      `# @nexusdi/core\n\n- [Examples](${TREE}${version}/libs/core/docs)\n`;
    const manifest = (version: string) =>
      `${JSON.stringify({ name: '@nexusdi/core', version }, null, 2)}\n`;
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 'sync@example.com');
      git('config', 'user.name', 'sync');
      git('config', 'commit.gpgsign', 'false');
      git('config', 'core.hooksPath', '/dev/null');
      write(
        'package.json',
        `${JSON.stringify({ name: 'root', private: true, workspaces: ['libs/*'] })}\n`,
      );
      write('libs/core/package.json', manifest('0.3.2'));
      write('libs/core/README.md', readme('0.3.2'));
      git('add', '-A');
      git('commit', '-qm', 'base');
      git('switch', '-qc', 'release/0.4');
      write('libs/core/package.json', manifest('0.4.0-rc.1'));
      write('libs/core/README.md', readme('0.4.0-rc.1'));
      git('commit', '-qam', 'rc.1');
      git('switch', '-q', 'main');
      write('libs/core/README.md', readme('0.3.3'));
      git('commit', '-qam', '0.3.3');
      git('switch', '-q', 'release/0.4');
      expect(() => git('merge', '--no-ff', '--no-commit', 'main')).toThrow();

      execFileSync(
        'node',
        [join(workspaceRoot, 'tools/release/sync.mjs'), 'restore'],
        // restore regenerates the lockfile, which needs no registry here.
        {
          cwd: dir,
          stdio: 'ignore',
          env: { ...process.env, npm_config_offline: 'true' },
        },
      );

      expect(readFileSync(join(dir, 'libs/core/README.md'), 'utf8')).toBe(
        readme('0.4.0-rc.1'),
      );
      expect(git('diff', '--name-only', '--diff-filter=U')).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
