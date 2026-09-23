import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { checkDeploy, type DeployContext } from './docs/docs-deploy';
import { DOCS, FIXTURES } from './docs/paths';

const dir = join(FIXTURES, 'docs-deploy');
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const context = (over: Partial<DeployContext> = {}): DeployContext => ({
  today: new Date('2027-02-01'),
  newestStableTag: '@nexusdi/core@0.4.0',
  v050Date: null,
  isAncestor: () => true,
  ...over,
});

describe('docs-deploy fixtures', () => {
  it('passes the clean fixture', () => {
    expect(
      checkDeploy(read(join(dir, 'clean/deploy.json')), context()),
    ).toEqual([]);
  });

  it('fails an unknown mode', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/unknown-mode/deploy.json')),
        context(),
      ),
    ).toEqual([
      'apps/docs/deploy.json: mode must be one of snapshot-only, rc, final, retired; found "preview".',
    ]);
  });

  it('fails rc mode before the snapshot exists', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/rc-without-assets/deploy.json')),
        context(),
      ),
    ).toEqual([
      'apps/docs/deploy.json: mode "rc" needs snapshot.revision 1 or later. Run docs-snapshot.yml and merge its pull request first.',
    ]);
  });

  it('fails a root.sha with no reason', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/sha-without-reason/deploy.json')),
        context(),
      ),
    ).toEqual([
      'apps/docs/deploy.json: root.sha is set, so root.reason must say why the root cannot wait for the next release.',
    ]);
  });

  it('fails final mode once the retention has ended', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/retention-due/deploy.json')),
        context({ today: new Date('2027-08-01'), v050Date: '2027-05-01' }),
      ),
    ).toEqual([
      'apps/docs/deploy.json: the /v0.3/ retention ended (six months after 2027-01-15, and @nexusdi/core@0.5.0 is tagged). Set mode to "retired".',
    ]);
  });

  it('passes final mode while the retention runs', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/retention-due/deploy.json')),
        context({ today: new Date('2027-08-01'), v050Date: null }),
      ),
    ).toEqual([]);
  });

  it('fails a root.sha that does not descend from the release tag', () => {
    expect(
      checkDeploy(
        read(join(dir, 'sabotaged/sha-not-descendant/deploy.json')),
        context({ isAncestor: () => false }),
      ),
    ).toEqual([
      'apps/docs/deploy.json: root.sha abc1234 does not descend from @nexusdi/core@0.4.0. A re-cut builds from a commit after the release tag.',
    ]);
  });
});

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

describe('docs-deploy on apps/docs', () => {
  it('holds for the committed deploy.json', () => {
    const tags =
      git(['tag', '--list', '@nexusdi/core@*', '--sort=-v:refname']) ?? '';
    const stable =
      tags.split('\n').find((tag) => /@\d+\.\d+\.\d+$/.test(tag)) ?? null;
    const v050 = git(['log', '-1', '--format=%cs', '@nexusdi/core@0.5.0']);

    expect(
      checkDeploy(read(join(DOCS, 'deploy.json')), {
        today: new Date(),
        newestStableTag: stable,
        v050Date: v050,
        isAncestor: (ancestor, descendant) =>
          git(['merge-base', '--is-ancestor', ancestor, descendant]) !== null,
      }),
    ).toEqual([]);
  });
});
