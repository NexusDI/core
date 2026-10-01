import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { EVENTS } from '@nexusdi/release';

/**
 * The release workflow's settings that the release spec depends on and that
 * nothing else would notice losing (release spec sections 4 and 6).
 *
 * tools/release/lib.mjs decides what each event does, and release.yml offers
 * the events as a choice input, so the two lists are held together here.
 */

interface Step {
  name?: string;
  run?: string;
}

interface Workflow {
  on: {
    workflow_dispatch?: { inputs?: Record<string, { options?: string[] }> };
    push?: { branches?: string[] };
  };
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<
    string,
    { environment?: string; env?: Record<string, string>; steps?: Step[] }
  >;
}

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf8');
const workflow = (name: string) =>
  parse(read(`.github/workflows/${name}`)) as Workflow;

const release = workflow('release.yml');
const job = Object.values(release.jobs)[0];
const runs = (job?.steps ?? []).map((step) => step.run ?? '');

describe('release.yml', () => {
  it('offers exactly the events tools/release/lib.mjs plans', () => {
    expect(release.on.workflow_dispatch?.inputs?.event?.options).toEqual(
      Object.keys(EVENTS),
    );
  });

  it('runs in the release environment, the one npm and the deploy key admit', () => {
    expect(Object.keys(release.jobs)).toHaveLength(1);
    expect(job?.environment).toBe('release');
  });

  it('never runs two releases at once and never cancels one', () => {
    expect(release.concurrency).toEqual({
      group: 'release',
      'cancel-in-progress': false,
    });
  });

  it('installs no git hooks, so the sync merge commits in CI', () => {
    expect(job?.env?.HUSKY).toBe('0');
  });

  it('grants the plan read access to check runs', () => {
    expect(release.permissions?.checks).toBe('read');
  });

  it('never publishes through nx-release-publish, which ignores --dryRun (L11)', () => {
    expect(runs.join('\n')).not.toMatch(/nx-release-publish/);
  });

  it('names the remote of the atomic push, or nx reads the first refspec as one', () => {
    const changelog = runs.filter((run) =>
      run.includes('nx release changelog'),
    );
    expect(changelog).toHaveLength(1);
    expect(changelog[0]).toMatch(/--git-remote origin/);
    expect(changelog[0]).toMatch(/--git-push-args=\$PUSH_REFS/);
  });
});

describe('the branches the release spec protects', () => {
  const branches = ['main', 'release/**', '[0-9]*.x', 'sync/**'];

  it('run CI and CodeQL on every push to them', () => {
    expect(workflow('ci.yml').on.push?.branches).toEqual(branches);
    expect(workflow('codeql.yml').on.push?.branches).toEqual(branches);
  });
});

describe('the sync merge', () => {
  it('unions the package changelogs, so both sides of a sync keep their sections', () => {
    expect(read('.gitattributes')).toMatch(
      /^libs\/\*\/CHANGELOG\.md merge=union$/m,
    );
  });

  it('is the one merge commit the hooks let through', () => {
    for (const hook of ['.husky/pre-merge-commit', '.husky/pre-commit']) {
      expect(read(hook), hook).toMatch(/git symbolic-ref --quiet --short HEAD/);
      expect(read(hook), hook).toMatch(/sync\/\*\)/);
    }
  });
});
