import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * /next/ shows the line in prerelease: the highest `release/X.Y` branch that
 * holds commits main lacks, else main (release spec §7.1.2, docs spec §15,
 * amended 2026-10-01). A release branch main has fast-forwarded to after its
 * stable release holds nothing new, so /next/ falls back to main.
 */
const RELEASE = /^refs\/heads\/(release\/(\d+)\.(\d+))$/;

/**
 * The branch and commit /next/ builds from. `lsRemote` is the output of
 * `git ls-remote --heads origin 'refs/heads/release/*'`. `isAhead` asks
 * whether a commit has commits main lacks; it runs for the highest branches
 * first and stops at the first yes. `sha` is null for main, which docs.yml
 * builds from its own checkout.
 */
export function pickNextSource(lsRemote, isAhead) {
  const branches = lsRemote
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .flatMap(([sha, ref]) => {
      const match = RELEASE.exec(ref ?? '');
      return match
        ? [{ branch: match[1], sha, major: +match[2], minor: +match[3] }]
        : [];
    })
    .sort((a, b) => b.major - a.major || b.minor - a.minor);

  const ahead = branches.find(({ sha }) => isAhead(sha));
  return ahead
    ? { branch: ahead.branch, sha: ahead.sha }
    : { branch: 'main', sha: null };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// `node apps/docs/tools/deploy/next-source.mjs` in docs.yml's checkout picks
// the source and writes `ref`, `sha` and `is_main` as step outputs.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const pick = pickNextSource(
    git('ls-remote', '--heads', 'origin', 'refs/heads/release/*'),
    (sha) => {
      // A push to the branch after the checkout leaves its head missing
      // locally, so the commit is fetched before it is compared.
      git('fetch', '--no-tags', '--quiet', 'origin', sha);
      return Number(git('rev-list', '--count', `origin/main..${sha}`)) > 0;
    },
  );
  const sha = pick.sha ?? git('rev-parse', 'HEAD');
  console.log(`/next/ builds from ${pick.branch} at ${sha}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `ref=${pick.branch}\nsha=${sha}\nis_main=${pick.sha === null}\n`,
    );
  }
}
