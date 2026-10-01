// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readArchives, validateArchives } from './archives.mjs';

const CLI = join(import.meta.dirname, 'archives.mjs');
const DEPLOY_JSON = join(import.meta.dirname, '..', '..', 'deploy.json');

const deployConfig = () => ({
  mode: 'snapshot-only',
  root: { tag: null, sha: null, reason: null },
  snapshot: {
    release: 'docs-snapshot-0.3',
    source: '6d5e4f3',
    revision: 0,
    assets: null,
  },
  finalDate: null,
});

const snapshot = { line: '0.3', kind: 'snapshot' };
const tag = (line, version) => ({
  line,
  kind: 'tag',
  tag: `@nexusdi/core@${version}`,
});

describe('validateArchives', () => {
  it('accepts the 0.3 snapshot alone', () => {
    expect(validateArchives({ archives: [snapshot] }, deployConfig())).toEqual(
      [],
    );
  });

  it('accepts tag archives after the snapshot in ascending order', () => {
    expect(
      validateArchives(
        { archives: [snapshot, tag('0.4', '0.4.3'), tag('0.10', '0.10.0')] },
        deployConfig(),
      ),
    ).toEqual([]);
  });

  it('rejects a file that is not an object with an archives list', () => {
    expect(validateArchives([snapshot], deployConfig())).toEqual([
      'archives.json must hold one JSON object.',
    ]);
    expect(validateArchives({}, deployConfig())).toEqual([
      'archives must be a list.',
    ]);
  });

  it('rejects an unknown top-level key', () => {
    expect(
      validateArchives({ archives: [snapshot], pin: 1 }, deployConfig()),
    ).toEqual(['archives.json has an unknown key "pin".']);
  });

  it('rejects a line that is not X.Y', () => {
    expect(
      validateArchives(
        { archives: [{ ...tag('0.4', '0.4.3'), line: 'v0.4' }] },
        deployConfig(),
      ),
    ).toEqual(['archives[0].line must be X.Y, such as "0.4"; found "v0.4".']);
  });

  it('rejects lines out of order or repeated, comparing numerically', () => {
    expect(
      validateArchives(
        {
          archives: [
            snapshot,
            tag('0.10', '0.10.0'),
            tag('0.9', '0.9.1'),
            tag('0.9', '0.9.2'),
          ],
        },
        deployConfig(),
      ),
    ).toEqual([
      'archives[2].line "0.9" must come after "0.10". Lines are ascending and unique.',
      'archives[3].line "0.9" must come after "0.9". Lines are ascending and unique.',
    ]);
  });

  it('rejects an unknown kind', () => {
    expect(
      validateArchives(
        { archives: [{ line: '0.4', kind: 'branch' }] },
        deployConfig(),
      ),
    ).toEqual([
      'archives[0].kind must be "snapshot" or "tag"; found "branch".',
    ]);
  });

  it('allows the snapshot kind for line 0.3 only', () => {
    expect(
      validateArchives(
        { archives: [{ line: '0.4', kind: 'snapshot' }] },
        deployConfig(),
      ),
    ).toEqual([
      'archives[0] is a snapshot for line "0.4". Only line 0.3 has a snapshot; pin later lines by tag.',
    ]);
  });

  it('requires the deploy.json snapshot block for the snapshot kind', () => {
    const config = deployConfig();
    delete config.snapshot;
    expect(validateArchives({ archives: [snapshot] }, config)).toEqual([
      'archives[0] is the 0.3 snapshot, and deploy.json has no snapshot block to read its assets from.',
    ]);
  });

  it('rejects asset fields on the snapshot entry', () => {
    expect(
      validateArchives(
        { archives: [{ ...snapshot, sha256: 'a'.repeat(64) }] },
        deployConfig(),
      ),
    ).toEqual([
      'archives[0] has an unknown key "sha256". The snapshot assets live in deploy.json.',
    ]);
  });

  it('requires a stable core tag on the same line', () => {
    expect(
      validateArchives(
        {
          archives: [
            { line: '0.4', kind: 'tag' },
            tag('0.5', '0.4.3'),
            tag('0.6', '0.6.0-rc.1'),
            { ...tag('0.7', '0.7.0'), tag: '@nexusdi/react@0.7.0' },
          ],
        },
        deployConfig(),
      ),
    ).toEqual([
      'archives[0].tag must be "@nexusdi/core@0.4.N"; found undefined.',
      'archives[1].tag must be "@nexusdi/core@0.5.N"; found "@nexusdi/core@0.4.3".',
      'archives[2].tag must be "@nexusdi/core@0.6.N"; found "@nexusdi/core@0.6.0-rc.1".',
      'archives[3].tag must be "@nexusdi/core@0.7.N"; found "@nexusdi/react@0.7.0".',
    ]);
  });

  it('rejects an unknown key on a tag entry', () => {
    expect(
      validateArchives(
        { archives: [{ ...tag('0.4', '0.4.3'), sha: 'abc1234' }] },
        deployConfig(),
      ),
    ).toEqual(['archives[0] has an unknown key "sha".']);
  });
});

/** A directory holding archives.json beside the committed deploy.json. */
function site(archives) {
  const dir = mkdtempSync(join(tmpdir(), 'archives-'));
  copyFileSync(DEPLOY_JSON, join(dir, 'deploy.json'));
  writeFileSync(join(dir, 'archives.json'), JSON.stringify(archives));
  return join(dir, 'archives.json');
}

describe('readArchives', () => {
  it('reads a valid file against the deploy.json beside it', () => {
    const path = site({ archives: [snapshot] });
    expect(readArchives(path)).toEqual({ archives: [snapshot] });
  });

  it('throws with every finding', () => {
    const path = site({ archives: [{ line: '0.4', kind: 'snapshot' }] });
    expect(() => readArchives(path)).toThrow(
      `${path} is invalid:\n- archives[0] is a snapshot for line "0.4". Only line 0.3 has a snapshot; pin later lines by tag.`,
    );
  });
});

const run = (path) =>
  spawnSync(process.execPath, [CLI, path], { encoding: 'utf8' });

describe('archives.mjs CLI', () => {
  it('passes the committed archives.json', () => {
    const result = run(join(import.meta.dirname, '..', '..', 'archives.json'));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('fails a tag archive, which docs.yml cannot build yet', () => {
    const result = run(site({ archives: [snapshot, tag('0.4', '0.4.3')] }));
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(
      'tag archives are not built yet; the docs.yml tag-archive build lands before 0.5.0.',
    );
  });

  it('fails an invalid file', () => {
    const result = run(site({ archives: [{ line: '0.4', kind: 'snapshot' }] }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Only line 0.3 has a snapshot');
  });
});
