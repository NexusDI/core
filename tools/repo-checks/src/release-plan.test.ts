import { describe, expect, it } from 'vitest';

import {
  changelogSection,
  compareVersions,
  distTagFor,
  EVENTS,
  nextRcVersion,
  planRelease,
  reconcileCommands,
  refKind,
  type PlanFacts,
} from '@nexusdi/release';

/**
 * tools/release/lib.mjs decides every version, tag, dist-tag and push target
 * the release workflow uses (release spec sections 5 and 6). These tests hold
 * the event table, the version arithmetic and the preconditions of spec
 * section 5.1 against the cases the spec's lab and red-team walk found.
 */

const tag = (version: string) => `@nexusdi/core@${version}`;
const tags = (...versions: string[]) => versions.map(tag);

const GREEN = [
  { context: 'main', conclusion: 'success' },
  { context: 'workflows', conclusion: 'success' },
  { context: 'format', conclusion: 'success' },
  { context: 'packaging', conclusion: 'success' },
];

/** The repository as it stands before rc.0: 0.3.2 everywhere, nothing newer. */
function facts(overrides: Partial<PlanFacts>): PlanFacts {
  const history = tags('0.2.0', '0.3.0', '0.3.1', '0.3.2');
  return {
    event: 'rc',
    ref: 'release/0.4',
    mainSha: 'c6b88516d87d195589d6523ecd8a6fb9640cb3c4',
    tagsAll: history,
    tagsMergedHead: history,
    tagsMergedMain: history,
    remoteTags: history,
    remoteHeads: ['main', 'release/0.4'],
    mainIsAncestor: true,
    packages: [
      {
        name: '@nexusdi/core',
        versions: ['0.3.1', '0.3.2'],
        distTags: { latest: '0.3.2' },
      },
      { name: '@nexusdi/errors', versions: [], distTags: {} },
    ],
    release: { relationship: 'fixed', pattern: '@nexusdi/core@{version}' },
    deployMode: 'rc',
    archiveLines: ['0.3'],
    requiredChecks: GREEN,
    proposed: null,
    releaseExists: false,
    ...overrides,
  };
}

describe('refKind', () => {
  it('reads main, a release line and a maintenance line', () => {
    expect(refKind('main')).toEqual({ kind: 'main' });
    expect(refKind('release/0.4')).toEqual({ kind: 'release', line: '0.4' });
    expect(refKind('release/1.0')).toEqual({ kind: 'release', line: '1.0' });
    expect(refKind('0.3.x')).toEqual({ kind: 'maintenance', line: '0.3' });
  });

  it('reads anything else as other', () => {
    expect(refKind('feat/core-0.4')).toEqual({ kind: 'other' });
    expect(refKind('release/0.4.1')).toEqual({ kind: 'other' });
    expect(refKind('sync/0.4-abc')).toEqual({ kind: 'other' });
  });
});

describe('the event table', () => {
  it('names the five events of spec section 6.1', () => {
    expect(Object.keys(EVENTS)).toEqual([
      'rc',
      'stable',
      'patch',
      'sync',
      'resume',
    ]);
  });

  it('refuses an event on a ref it does not run on, in a dry run too', () => {
    const plan = planRelease(facts({ event: 'rc', ref: 'main', dryRun: true }));
    expect(plan.fatal).toMatch(/rc runs on release\/X\.Y/);
  });
});

describe('compareVersions', () => {
  it('orders rc.10 above rc.9', () => {
    const sorted = ['0.4.0-rc.10', '0.4.0-rc.9', '0.4.0-rc.2'].sort(
      compareVersions,
    );
    expect(sorted).toEqual(['0.4.0-rc.2', '0.4.0-rc.9', '0.4.0-rc.10']);
  });

  it('orders a stable above its prereleases', () => {
    expect(compareVersions('0.4.0', '0.4.0-rc.3')).toBeGreaterThan(0);
    expect(compareVersions('0.3.10', '0.3.9')).toBeGreaterThan(0);
  });
});

describe('nextRcVersion', () => {
  it('starts a line at rc.0', () => {
    expect(nextRcVersion('0.4', tags('0.3.2'))).toBe('0.4.0-rc.0');
  });

  it('continues past rc.9 numerically', () => {
    const rcs = Array.from({ length: 11 }, (_, n) => `0.4.0-rc.${n}`);
    expect(nextRcVersion('0.4', tags(...rcs))).toBe('0.4.0-rc.11');
  });

  it('takes 1.0.0-rc.0 from the branch name, which no relative specifier reaches (L5)', () => {
    expect(nextRcVersion('1.0', tags('0.9.3'))).toBe('1.0.0-rc.0');
  });

  it('ignores another line', () => {
    expect(nextRcVersion('0.5', tags('0.4.0-rc.3'))).toBe('0.5.0-rc.0');
  });
});

describe('distTagFor', () => {
  it('tags a prerelease next', () => {
    expect(
      distTagFor({ kind: 'release', line: '0.4', version: '0.4.0-rc.1' }),
    ).toBe('next');
  });

  it('tags a maintenance patch release-X.Y, which npm accepts and 0.3.x it rejects', () => {
    expect(
      distTagFor({ kind: 'maintenance', line: '0.3', version: '0.3.4' }),
    ).toBe('release-0.3');
  });

  it('tags a stable on main or a release line latest', () => {
    expect(distTagFor({ kind: 'main', version: '0.3.3' })).toBe('latest');
    expect(distTagFor({ kind: 'release', line: '0.4', version: '0.4.0' })).toBe(
      'latest',
    );
  });
});

describe('planRelease, rc', () => {
  it('plans rc.0 with next, one push to the line and no GitHub latest', () => {
    const plan = planRelease(facts({}));
    expect(plan.fatal).toBeNull();
    expect(plan.blockers).toEqual([]);
    expect(plan.outputs).toMatchObject({
      version: '0.4.0-rc.0',
      tag: '@nexusdi/core@0.4.0-rc.0',
      dist_tag: 'next',
      push_refs: 'HEAD:refs/heads/release/0.4',
      line: '0.4',
      github_latest: 'false',
    });
  });

  it('blocks rc.N while the newest rc is missing on npm, and points at resume', () => {
    const history = tags('0.3.2', '0.4.0-rc.0');
    const plan = planRelease(
      facts({ tagsAll: history, tagsMergedHead: history, remoteTags: history }),
    );
    expect(plan.outputs.version).toBe('0.4.0-rc.1');
    expect(plan.blockers.join('\n')).toMatch(
      /0\.4\.0-rc\.0 is not on npm.*event=resume/,
    );
  });

  it('blocks an rc for a line main already released', () => {
    const history = tags('0.3.2', '0.4.0');
    const plan = planRelease(
      facts({
        tagsAll: history,
        tagsMergedHead: history,
        tagsMergedMain: history,
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(/0\.4\.0 is already tagged/);
  });

  it('blocks a fixed group whose tag pattern holds {projectName} (L1)', () => {
    const plan = planRelease(
      facts({
        release: { relationship: 'fixed', pattern: '{projectName}@{version}' },
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(/\{projectName\}/);
  });

  it('blocks on a required check that is not green', () => {
    const plan = planRelease(
      facts({
        requiredChecks: [
          ...GREEN.slice(1),
          { context: 'main', conclusion: 'in_progress' },
        ],
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(/check main is in_progress/);
  });

  it('blocks when no ruleset requires checks on the ref', () => {
    const plan = planRelease(facts({ requiredChecks: [] }));
    expect(plan.blockers.join('\n')).toMatch(
      /no ruleset requires status checks on release\/0\.4/,
    );
  });

  it('blocks a version already on npm or a tag already on the remote', () => {
    const plan = planRelease(
      facts({
        remoteTags: [...tags('0.3.2'), tag('0.4.0-rc.0')],
        packages: [
          { name: '@nexusdi/core', versions: ['0.4.0-rc.0'], distTags: {} },
        ],
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(
      /tag @nexusdi\/core@0\.4\.0-rc\.0 already exists on origin/,
    );
    expect(plan.blockers.join('\n')).toMatch(
      /@nexusdi\/core@0\.4\.0-rc\.0 is already on npm/,
    );
  });
});

describe('planRelease, stable', () => {
  const stableFacts = (overrides: Partial<PlanFacts>) =>
    facts({ event: 'stable', deployMode: 'final', ...overrides });

  it('plans X.Y.0 with one atomic push to the line and main, and names the maintenance branch', () => {
    const plan = planRelease(stableFacts({}));
    expect(plan.blockers).toEqual([]);
    expect(plan.outputs).toMatchObject({
      version: '0.4.0',
      dist_tag: 'latest',
      push_refs: 'HEAD:refs/heads/release/0.4 HEAD:refs/heads/main',
      maint_branch: '0.3.x',
      github_latest: 'true',
      stable_tail: 'true',
    });
  });

  it('names 0.N.x as the maintenance branch of 1.0', () => {
    const history = tags('0.9.3');
    const plan = planRelease(
      stableFacts({
        ref: 'release/1.0',
        tagsAll: history,
        tagsMergedHead: history,
        tagsMergedMain: history,
        remoteTags: history,
        archiveLines: ['0.3', '0.9'],
      }),
    );
    expect(plan.outputs.version).toBe('1.0.0');
    expect(plan.outputs.maint_branch).toBe('0.9.x');
  });

  it('blocks until main is an ancestor, and asks for a sync', () => {
    const plan = planRelease(stableFacts({ mainIsAncestor: false }));
    expect(plan.blockers.join('\n')).toMatch(/event=sync/);
  });

  it('blocks until deploy.json is final', () => {
    const plan = planRelease(stableFacts({ deployMode: 'rc' }));
    expect(plan.blockers.join('\n')).toMatch(/deploy\.json/);
  });

  it('blocks until archives.json covers the line the stable retires', () => {
    const history = tags('0.3.2', '0.4.3');
    const plan = planRelease(
      stableFacts({
        ref: 'release/0.5',
        tagsAll: history,
        tagsMergedHead: history,
        tagsMergedMain: history,
        remoteTags: history,
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(
      /archives\.json has no entry for line 0\.4/,
    );
  });
});

describe('planRelease, patch', () => {
  const patchFacts = (overrides: Partial<PlanFacts>) =>
    facts({
      event: 'patch',
      ref: 'main',
      proposed: { versions: ['0.3.3'], current: '0.3.2' },
      ...overrides,
    });

  it('plans 0.3.3 on main with latest', () => {
    const plan = planRelease(patchFacts({}));
    expect(plan.blockers).toEqual([]);
    expect(plan.outputs).toMatchObject({
      version: '0.3.3',
      dist_tag: 'latest',
      push_refs: 'HEAD:refs/heads/main',
      github_latest: 'true',
    });
  });

  it('stops with nothing to release when no commit bumps a package, in a dry run too', () => {
    const plan = planRelease(
      patchFacts({
        proposed: { versions: [], current: '0.3.2' },
        dryRun: true,
      }),
    );
    expect(plan.fatal).toMatch(/Nothing to release/);
  });

  it('refuses a minor from main after 1.0, since minors go through release/X.Y', () => {
    const history = tags('1.0.0');
    const plan = planRelease(
      patchFacts({
        tagsAll: history,
        tagsMergedHead: history,
        tagsMergedMain: history,
        remoteTags: history,
        proposed: { versions: ['1.1.0'], current: '1.0.0' },
      }),
    );
    expect(plan.blockers.join('\n')).toMatch(
      /1\.1\.0 is not the patch after 1\.0\.0/,
    );
  });

  it('refuses two different proposed versions', () => {
    const plan = planRelease(
      patchFacts({
        proposed: { versions: ['0.3.3', '0.3.4'], current: '0.3.2' },
      }),
    );
    expect(plan.fatal).toMatch(/more than one version/);
  });

  it('plans 0.3.4 on 0.3.x with release-0.3 and points GitHub latest back at the newest stable', () => {
    const all = tags('0.3.2', '0.3.3', '0.4.0', '0.4.1');
    const line = tags('0.3.2', '0.3.3');
    const plan = planRelease(
      patchFacts({
        ref: '0.3.x',
        tagsAll: all,
        tagsMergedHead: line,
        tagsMergedMain: all,
        remoteTags: all,
        proposed: { versions: ['0.3.4'], current: '0.3.3' },
      }),
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.outputs).toMatchObject({
      version: '0.3.4',
      dist_tag: 'release-0.3',
      push_refs: 'HEAD:refs/heads/0.3.x',
      github_latest: 'false',
      latest_fixup_tag: '@nexusdi/core@0.4.1',
    });
  });
});

describe('planRelease, sync', () => {
  it('names the sync branch after main', () => {
    const plan = planRelease(facts({ event: 'sync', mainIsAncestor: false }));
    expect(plan.fatal).toBeNull();
    expect(plan.outputs.sync_branch).toBe('sync/0.4-c6b88516d87d');
  });

  it('refuses a sync branch that already exists, and never overwrites it', () => {
    const plan = planRelease(
      facts({
        event: 'sync',
        mainIsAncestor: false,
        remoteHeads: ['main', 'release/0.4', 'sync/0.4-c6b88516d87d'],
      }),
    );
    expect(plan.fatal).toMatch(/sync\/0\.4-c6b88516d87d already exists/);
  });
});

describe('planRelease, resume', () => {
  it('finishes the newest reachable rc with next', () => {
    const history = tags('0.3.2', '0.4.0-rc.0');
    const plan = planRelease(
      facts({
        event: 'resume',
        tagsAll: history,
        tagsMergedHead: history,
        remoteTags: history,
        requiredChecks: [],
      }),
    );
    expect(plan.fatal).toBeNull();
    expect(plan.blockers).toEqual([]);
    expect(plan.outputs).toMatchObject({
      version: '0.4.0-rc.0',
      dist_tag: 'next',
      release_exists: 'false',
      all_published: 'false',
    });
  });

  it('refuses a tag that never reached the remote', () => {
    const history = tags('0.3.2', '0.4.0-rc.0');
    const plan = planRelease(
      facts({ event: 'resume', tagsAll: history, tagsMergedHead: history }),
    );
    expect(plan.fatal).toMatch(/not on origin/);
  });
});

describe('reconcileCommands', () => {
  it('points latest at an rc for a package with no stable version, the bootstrap placeholder included', () => {
    expect(
      reconcileCommands({
        version: '0.4.0-rc.0',
        distTag: 'next',
        resume: false,
        packages: [
          {
            name: '@nexusdi/core',
            versions: ['0.3.2', '0.4.0-rc.0'],
            distTags: { latest: '0.3.2', next: '0.4.0-rc.0' },
          },
          {
            name: '@nexusdi/errors',
            versions: ['0.0.0-bootstrap.0', '0.4.0-rc.0'],
            distTags: { bootstrap: '0.0.0-bootstrap.0', next: '0.4.0-rc.0' },
          },
        ],
      }),
    ).toEqual([
      { name: '@nexusdi/errors', version: '0.4.0-rc.0', tag: 'latest' },
    ]);
  });

  it('moves next up to a new latest so next never points below it', () => {
    expect(
      reconcileCommands({
        version: '0.4.0',
        distTag: 'latest',
        resume: false,
        packages: [
          {
            name: '@nexusdi/core',
            versions: ['0.4.0-rc.2', '0.4.0'],
            distTags: { latest: '0.4.0', next: '0.4.0-rc.2' },
          },
        ],
      }),
    ).toEqual([{ name: '@nexusdi/core', version: '0.4.0', tag: 'next' }]);
  });

  it('on resume also points the event dist-tag at the version', () => {
    expect(
      reconcileCommands({
        version: '0.3.3',
        distTag: 'latest',
        resume: true,
        packages: [
          {
            name: '@nexusdi/core',
            versions: ['0.3.2', '0.3.3'],
            distTags: { latest: '0.3.2' },
          },
        ],
      }),
    ).toEqual([{ name: '@nexusdi/core', version: '0.3.3', tag: 'latest' }]);
  });
});

describe('changelogSection', () => {
  it('takes one version section of a package changelog', () => {
    const text = '## 0.3.3\n\n### Fixes\n\n- a\n\n## 0.3.2\n\n- b\n';
    expect(changelogSection(text, '0.3.3')).toBe('### Fixes\n\n- a');
    expect(changelogSection(text, '0.3.2')).toBe('- b');
    expect(changelogSection(text, '0.3.1')).toBeNull();
  });

  it('does not match 0.3.3 against 0.3.30', () => {
    expect(changelogSection('## 0.3.30\n\n- x\n', '0.3.3')).toBeNull();
  });
});
