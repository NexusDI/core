/**
 * Checks out libs/ at a released core, so a published run describes a
 * released version (spec 4.8): the pushed tag on a tag run, else the
 * newest @nexusdi/core@ tag. The fixtures use the 0.4 API, so only tags
 * from 0.4.0-0 on count; with none, the workspace's libs/ stay and the
 * run says so.
 *
 *   node src/release-core.ts [--ref <tag>]
 */
import { execFileSync } from 'node:child_process';

import { compareVersions } from './competitor-releases.ts';
import { ROOT } from './consumer.ts';

const PREFIX = '@nexusdi/core@';
/** The first core version whose API the fixtures are written against. */
const FLOOR = '0.4.0-0';

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** The newest released core tag at or above FLOOR, or null. */
export function newestTag(tags: readonly string[]): string | null {
  const versions = tags
    .filter((t) => t.startsWith(PREFIX))
    .map((t) => t.slice(PREFIX.length))
    .filter((v) => compareVersions(v, FLOOR) >= 0)
    .sort(compareVersions);
  const newest = versions.at(-1);
  return newest === undefined ? null : `${PREFIX}${newest}`;
}

if (import.meta.main) {
  const refAt = process.argv.indexOf('--ref');
  const pushed = refAt === -1 ? '' : (process.argv[refAt + 1] ?? '');
  git('fetch', '--tags', '--force', 'origin');
  const tag =
    pushed !== ''
      ? pushed
      : newestTag(git('tag', '--list', `${PREFIX}*`).split('\n'));
  if (tag === null) {
    console.log(
      `No ${PREFIX} tag at or above ${FLOOR}: the run uses the workspace's libs/.`,
    );
  } else {
    // restore deletes the files the tag does not have, so no newer source
    // compiles beside the released one. It leaves the index alone, so the
    // results commit never picks up libs/.
    git('restore', '--source', tag, '--worktree', '--', 'libs/');
    console.log(`libs/ checked out at ${tag}.`);
  }
}
