/**
 * The results pull request of spec 4.8 and 14.5. It commits the timing
 * file and build.json, the deterministic files when they changed, and the
 * raw samples on a tag run, to chore/benchmarks-results-<date>-<sha7>, and
 * opens the pull request when a deterministic file changed (a competitor
 * pin change changes matrix.json's versions) or on a tag run. Otherwise it
 * commits nothing: the workflow's artifacts keep that run's files.
 *
 * Run by benchmarks.yml with GH_TOKEN and IS_TAG set.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { gitSha, runnerInfo } from './build.ts';
import { ROOT } from './consumer.ts';

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const DETERMINISTIC = ['matrix.json', 'probes.json', 'size.json'].map(
  (f) => `benchmarks/results/${f}`,
);

if (import.meta.main) {
  const isTag = process.env.IS_TAG === 'true';
  const sha = gitSha();
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
  git(
    'add',
    '--',
    ...DETERMINISTIC,
    'benchmarks/results/build.json',
    'benchmarks/results/timings',
  );
  if (isTag) git('add', '--', 'benchmarks/results/raw');
  const title = `chore(benchmarks): results ${date} ${sha}`;
  git('commit', '-m', title);
  git('push', 'origin', branch);
  const runner = runnerInfo();
  const timing = readdirSync(join(ROOT, 'benchmarks', 'results', 'timings'))
    .sort()
    .at(-1);
  const body = [
    `Benchmark results from ${sha}${isTag ? ', a tag run' : ''}.`,
    '',
    `- Runner: ${runner.cpu}, ${runner.cores} cores, ${runner.memoryGb} GB, ${runner.hosted ? 'GitHub-hosted' : 'self-hosted'}`,
    `- Node: ${process.versions.node}`,
    `- Timing file: benchmarks/results/timings/${timing ?? '(none)'}`,
    `- Deterministic files changed: ${changed ? 'yes' : 'no'}`,
  ].join('\n');
  execFileSync(
    'gh',
    [
      'pr',
      'create',
      '--base',
      'main',
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
