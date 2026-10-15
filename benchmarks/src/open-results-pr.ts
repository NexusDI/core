/**
 * The results pull request of spec 4.8 and 14.5. It commits the timing
 * file and build.json, the deterministic files when they changed, and the
 * raw samples on a tag run, to chore/benchmarks-results-<date>-<sha7>, and
 * opens the pull request when a deterministic file changed (a competitor
 * pin change changes matrix.json's versions) or on a tag run. Otherwise it
 * commits nothing: the workflow's artifacts keep that run's files.
 *
 * The pull request targets the branch the run measured (resultsBase).
 *
 * Run by benchmarks.yml with GH_TOKEN, IS_TAG and REF_NAME set, in a job that has
 * write access and never runs `npm ci`, so it imports node builtins only.
 * The checkout keeps no credentials; the push alone authenticates, through
 * gh's credential helper.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const RESULTS = 'benchmarks/results';

const DETERMINISTIC = [
  'matrix.json',
  'probes.json',
  'size.json',
  'scale.json',
].map((f) => `${RESULTS}/${f}`);

/**
 * What the results commit adds: the deterministic files, build.json, both
 * timing directories, the rendered scale page with its charts, and the raw
 * samples on a tag run. scale.json arrives with the deterministic artifact,
 * scale/ and the rendered files with the merge job's.
 */
export function resultsPaths(isTag: boolean, root = ROOT): string[] {
  // A path nothing wrote (scale/ and the startup chart before a timing job
  // exists) would make `git add` exit 128 and lose every other result.
  return [
    ...DETERMINISTIC,
    `${RESULTS}/build.json`,
    `${RESULTS}/timings`,
    `${RESULTS}/scale`,
    `${RESULTS}/scale.md`,
    `${RESULTS}/scale-startup.svg`,
    `${RESULTS}/scale-bundle.svg`,
    `${RESULTS}/README.md`,
    ...(isTag ? [`${RESULTS}/raw`] : []),
  ].filter((p) => existsSync(join(root, p)));
}

/** The pull request body's line naming the scale timing file. */
export function scaleLine(file: string): string {
  return `- Scale file: ${RESULTS}/scale/${file}`;
}

/**
 * The file of `dir` whose run started last. Two runs of one day differ by
 * their time, which the file name does not carry.
 */
export function newestByStartedAt(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      f,
      at: Date.parse(
        (
          JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
            startedAt: string;
          }
        ).startedAt,
      ),
    }))
    .sort((a, b) => b.at - a.at)[0]?.f;
}

interface TimingsHead {
  runner: {
    cpu: string;
    cores: number;
    memoryGb: number;
    hosted: boolean;
  };
  versions: { node: string };
}

/**
 * The base branch of the results pull request. A branch run targets its own
 * branch. A tag has no branch, so a tag run reads it from the tag and the
 * remote branches that contain the tagged commit, after RELEASING.md's
 * events: an rc is tagged on release/X.Y, a stable release fast-forwards
 * main to its tag, and a patch is tagged on main or on X.Y.x.
 */
export function resultsBase(
  isTag: boolean,
  refName: string,
  containing: readonly string[],
): string {
  if (!isTag) return refName;
  const version = /@(\d+)\.(\d+)\.\d+(-[^@]+)?$/.exec(refName);
  if (version === null) throw new Error(`not a release tag: ${refName}`);
  const [, major, minor, prerelease] = version;
  const candidates =
    prerelease === undefined
      ? ['main', `${major}.${minor}.x`]
      : [`release/${major}.${minor}`];
  const base = candidates.find((b) => containing.includes(b));
  if (base === undefined) {
    const found = containing.join(', ') || 'none';
    throw new Error(
      `${refName} is on none of ${candidates.join(', ')}. Branches that contain it: ${found}`,
    );
  }
  return base;
}

if (import.meta.main) {
  const isTag = process.env.IS_TAG === 'true';
  const refName = process.env.REF_NAME;
  if (!refName) throw new Error('REF_NAME is not set');
  // The results job checks out with fetch-depth 0, which fetches every
  // branch into refs/remotes/origin.
  const containing = git(
    'branch',
    '--remotes',
    '--contains',
    'HEAD',
    '--format=%(refname:lstrip=3)',
  )
    .split('\n')
    .filter(Boolean);
  const base = resultsBase(isTag, refName, containing);
  const sha = git('rev-parse', '--short=7', 'HEAD');
  const date = new Date().toISOString().slice(0, 10);
  const changed = git('status', '--porcelain', '--', ...DETERMINISTIC) !== '';
  if (!changed && !isTag) {
    console.log(
      'No deterministic file changed and this is no tag run: no pull request.',
    );
    process.exit(0);
  }
  const branch = `chore/benchmarks-results-${date}-${sha}`;
  git('config', 'user.name', 'github-actions[bot]');
  git(
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  );
  git('switch', '-c', branch);
  git('add', '--', ...resultsPaths(isTag));
  const title = `chore(benchmarks): results ${date} ${sha}`;
  git('commit', '-m', title);
  git(
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    'push',
    'origin',
    branch,
  );
  const dir = join(ROOT, 'benchmarks', 'results', 'timings');
  const timing = readdirSync(dir).sort().at(-1);
  if (timing === undefined) throw new Error('no timing file to report');
  // The runner that measured the timings, which is not this job's.
  const { runner, versions } = JSON.parse(
    readFileSync(join(dir, timing), 'utf8'),
  ) as TimingsHead;
  const scaleFile = newestByStartedAt(
    join(ROOT, 'benchmarks', 'results', 'scale'),
  );
  const body = [
    `Benchmark results from ${sha}${isTag ? ', a tag run' : ''}.`,
    '',
    `- Runner: ${runner.cpu}, ${runner.cores} cores, ${runner.memoryGb} GB, ${runner.hosted ? 'GitHub-hosted' : 'self-hosted'}`,
    `- Node: ${versions.node}`,
    `- Timing file: benchmarks/results/timings/${timing}`,
    ...(scaleFile === undefined ? [] : [scaleLine(scaleFile)]),
    `- Deterministic files changed: ${changed ? 'yes' : 'no'}`,
  ].join('\n');
  execFileSync(
    'gh',
    [
      'pr',
      'create',
      '--base',
      base,
      '--head',
      branch,
      '--title',
      title,
      '--body',
      body,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
}
