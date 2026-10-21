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

/** The changed files between `base` and HEAD; throws when git lacks `base`. */
function gitDiff(base) {
  return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\n')
    .filter(Boolean);
}

/**
 * The job's verdict for a base commit. `diff` lists the changed files and
 * throws when the base is unknown; tests inject it so no git process runs.
 */
export function decide(base, diff = gitDiff) {
  let touched = true;
  let note = '';
  // A new branch has no base to diff against, so the job checks everything.
  if (base !== '' && !ZERO.test(base)) {
    try {
      touched = touches(PATHS, diff(base));
    } catch {
      // A force-push can leave the old tip out of the clone.
      note = 'the base commit is not in the clone; ';
    }
  }
  return {
    touched,
    message:
      note +
      (touched
        ? 'this change touches a docs input; the docs job builds and checks the site'
        : 'this change touches no docs input; the docs job ends here'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { touched, message } = decide(process.argv[2] ?? '');
  console.log(message);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `touched=${touched}\n`);
}
