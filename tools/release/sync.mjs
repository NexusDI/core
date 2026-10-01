/**
 * Merges main into a release/X.Y line (release spec section 5.3 step 3).
 *
 *   node tools/release/sync.mjs merge <sync-branch>
 *     CI. Creates the sync branch from HEAD, merges origin/main without
 *     committing, settles the manifests and the lockfile, and commits. Any
 *     other conflict aborts the merge, leaves the branch at HEAD for the owner
 *     and exits 1 with the paths.
 *
 *   node tools/release/sync.mjs restore
 *     Local, on a sync branch during a hand merge, after the other conflicts
 *     are resolved. Settles the manifests and the lockfile the same way.
 *
 * Settling: every libs/*\/package.json keeps the line's own version and
 * in-workspace pins, and package-lock.json is regenerated from the result.
 */
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { mergeManifests, restoreWorkspacePins } from './lib.mjs';

const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
const tryRun = (cmd, args) => {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
};
const lines = (text) => (text ?? '').split('\n').filter(Boolean);
const unmerged = () =>
  lines(run('git', ['diff', '--name-only', '--diff-filter=U']));
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const stage = (path) => tryRun('git', ['show', `:${path}`]);
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

const manifests = () =>
  readdirSync('libs', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('libs', entry.name, 'package.json'))
    .filter((path) => existsSync(path));

/** A key both sides may change without it being a conflict: the restore puts it back. */
const restorable = (key, names) =>
  key === 'version' ||
  names.some(
    (name) =>
      /^(dev|peer|optional)?[dD]ependencies\./.test(key) &&
      key.endsWith(`.${name}`),
  );

/**
 * Brings every libs manifest to the merged content with the line's version and
 * pins, resolving a manifest conflict key by key. Returns the manifests whose
 * conflicts are real, which a person must resolve.
 */
function settleManifests() {
  const paths = manifests();
  const names = paths.map(
    (path) => JSON.parse(readFileSync(path, 'utf8')).name ?? '',
  );
  const conflicted = new Set(unmerged());
  // core carries the line's version, and a fixed group gives every package
  // the same one.
  const lineVersion = JSON.parse(
    run('git', ['show', 'HEAD:libs/core/package.json']),
  ).version;
  const unresolved = [];

  for (const path of paths) {
    const oursText = tryRun('git', ['show', `HEAD:${path}`]);
    if (conflicted.has(path)) {
      const [base, ours, theirs] = [1, 2, 3].map((n) => stage(`${n}:${path}`));
      if (!ours || !theirs) {
        unresolved.push(path);
        continue;
      }
      const merged = mergeManifests(
        base ? JSON.parse(base) : {},
        JSON.parse(ours),
        JSON.parse(theirs),
      );
      const real = merged.conflicts.filter((key) => !restorable(key, names));
      if (real.length > 0) {
        unresolved.push(`${path} (${real.join(', ')})`);
        continue;
      }
      writeJson(path, merged.result);
    }
    const current = JSON.parse(readFileSync(path, 'utf8'));
    writeJson(
      path,
      restoreWorkspacePins(
        current,
        oursText === null ? null : JSON.parse(oursText),
        names,
        lineVersion,
      ),
    );
    run('git', ['add', path]);
  }
  return unresolved;
}

function regenerateLockfile() {
  if (unmerged().includes('package-lock.json')) {
    run('git', ['checkout', '--ours', 'package-lock.json']);
  }
  run('npm', [
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  run('git', ['add', 'package-lock.json']);
}

function merge(branch) {
  // release/0.4 has no .gitattributes until its first sync lands, and the
  // union driver has to apply to that sync too.
  const attributes = join(
    run('git', ['rev-parse', '--git-path', 'info']),
    'attributes',
  );
  appendFileSync(attributes, 'libs/*/CHANGELOG.md merge=union\n');

  run('git', ['switch', '-c', branch]);
  tryRun('git', ['merge', '--no-ff', '--no-commit', 'origin/main']);

  const unresolved = settleManifests();
  // Settled manifests are staged, and the lockfile is regenerated below, so
  // whatever else is still unmerged needs a person.
  const others = unmerged().filter(
    (path) =>
      path !== 'package-lock.json' &&
      !/^libs\/[^/]+\/package\.json$/.test(path),
  );
  const blocking = [...new Set([...unresolved, ...others])];

  if (blocking.length > 0) {
    run('git', ['merge', '--abort']);
    summary(
      [
        '### Sync needs a hand merge',
        '',
        `These paths conflict when merging origin/main into ${branch}:`,
        '',
        ...blocking.map((path) => `- \`${path}\``),
        '',
        `The branch \`${branch}\` is on origin at the release line's head. Resolve it locally:`,
        '',
        '```sh',
        `git fetch origin && git switch ${branch}`,
        'git merge origin/main',
        '# resolve the paths above, then:',
        'node tools/release/sync.mjs restore',
        'git commit --no-edit && git push',
        '```',
        '',
        'Then open the pull request into the release line and merge it with a merge commit.',
      ].join('\n'),
    );
    console.log(`::error::Sync stopped on conflicts: ${blocking.join(', ')}`);
    return false;
  }

  regenerateLockfile();
  run('git', ['commit', '--no-edit']);
  return true;
}

function restore() {
  const unresolved = settleManifests();
  if (unresolved.length > 0) {
    console.error(
      `Resolve these manifests by hand first: ${unresolved.join(', ')}`,
    );
    process.exit(1);
  }
  regenerateLockfile();
  const left = unmerged();
  if (left.length > 0) {
    console.error(`Still unmerged: ${left.join(', ')}`);
    process.exit(1);
  }
  console.log('Manifests and lockfile settled. Commit the merge.');
}

const [command, branch] = process.argv.slice(2);
if (command === 'merge' && branch) {
  process.exit(merge(branch) ? 0 : 1);
} else if (command === 'restore') {
  restore();
} else {
  console.error('usage: sync.mjs merge <sync-branch> | sync.mjs restore');
  process.exit(2);
}
