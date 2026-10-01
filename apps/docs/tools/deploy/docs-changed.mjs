import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Whether a change touches what the docs site builds from. The CI `docs` job
 * reads it before installing anything (docs spec §15.3).
 */

/** docs.yml's on.push.paths; docs-ci-job.test.ts holds the two equal. */
export const DOCS_YML_PATHS = [
  'apps/docs/**',
  'libs/**',
  'internal/**',
  'examples/meridian/**',
  'tools/doc-examples/**',
  'benchmarks/**',
  'package.json',
  'package-lock.json',
  '.github/workflows/docs.yml',
];

/** The other workflows that build or check the site. */
export const EXTRA_PATHS = [
  '.github/workflows/ci.yml',
  '.github/workflows/docs-next.yml',
  '.github/workflows/docs-snapshot.yml',
];

export const PATHS = [...DOCS_YML_PATHS, ...EXTRA_PATHS];

export function touches(paths, files) {
  return files.some((file) =>
    paths.some((path) =>
      path.endsWith('/**') ? file.startsWith(path.slice(0, -2)) : file === path,
    ),
  );
}

const ZERO = /^0+$/;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2] ?? '';
  let touched = true;
  let note = '';
  // A new branch has no base to diff against, so the job checks everything.
  if (base !== '' && !ZERO.test(base)) {
    try {
      touched = touches(
        PATHS,
        execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split('\n')
          .filter(Boolean),
      );
    } catch {
      // A force-push can leave the old tip out of the clone.
      note = 'the base commit is not in the clone; ';
    }
  }
  console.log(
    note +
      (touched
        ? 'this change touches a docs input; the docs job builds and checks the site'
        : 'this change touches no docs input; the docs job ends here'),
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `touched=${touched}\n`);
}
