/**
 * The release workflow's plan step (release spec section 6.3 step 4).
 *
 * Reads the dispatch, the tags, the required checks and npm, and writes the
 * plan's outputs to GITHUB_OUTPUT. Every decision is made by planRelease in
 * lib.mjs; this file only gathers facts.
 *
 * Exit status: 1 on a fatal finding, dry run or not. A blocker also exits 1
 * in a real run. In a dry run the blockers go to the `blocked` output and the
 * step summary, and the workflow fails after its preview.
 *
 * Environment: EVENT, DRY_RUN, GITHUB_REF_NAME, GITHUB_SHA, GITHUB_REPOSITORY,
 * GH_TOKEN, and GITHUB_OUTPUT and GITHUB_STEP_SUMMARY when run in Actions.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';

import { planRelease } from './lib.mjs';

const env = process.env;
const event = env.EVENT ?? '';
const dryRun = env.DRY_RUN === 'true';
const ref = env.GITHUB_REF_NAME ?? '';
const sha = env.GITHUB_SHA ?? '';
const repo = env.GITHUB_REPOSITORY ?? 'NexusDI/core';

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
const lines = (text) => text.split('\n').filter(Boolean);
const gitTags = (...args) =>
  lines(run('git', ['tag', '-l', '@nexusdi/core@*', ...args]));

function summary(text) {
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function publishedPackages() {
  return readdirSync('libs', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('libs', entry.name, 'package.json'))
    .flatMap((path) => {
      try {
        return [JSON.parse(readFileSync(path, 'utf8'))];
      } catch {
        return [];
      }
    })
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => manifest.name);
}

/** npm's record of a package. A package npm has never seen has no versions. */
function npmPackage(name) {
  try {
    const out = run('npm', ['view', name, 'versions', 'dist-tags', '--json']);
    const data = JSON.parse(out);
    const versions = data.versions ?? [];
    return {
      name,
      versions: Array.isArray(versions) ? versions : [versions],
      distTags: data['dist-tags'] ?? {},
    };
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/E404/.test(output)) return { name, versions: [], distTags: {} };
    throw new Error(`npm view ${name} failed:\n${output}`);
  }
}

/** The required checks the rulesets put on the ref, with their state on this commit. */
function requiredChecks() {
  const rules = JSON.parse(
    run('gh', [
      'api',
      `repos/${repo}/rules/branches/${encodeURIComponent(ref)}`,
      '--paginate',
    ]),
  );
  const required = rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters.required_status_checks);
  return required.map(({ context, integration_id }) => {
    const runs = JSON.parse(
      run('gh', [
        'api',
        `repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(context)}&filter=latest`,
      ]),
    ).check_runs.filter(
      (r) => integration_id === undefined || r.app?.id === integration_id,
    );
    const latest = runs[0];
    return {
      context,
      conclusion: !latest
        ? 'missing'
        : latest.status !== 'completed'
          ? latest.status
          : latest.conclusion,
    };
  });
}

/** What nx would release from conventional commits, without writing anything. */
async function proposedPatch() {
  const { releaseVersion } = await import('nx/release');
  const result = await releaseVersion({
    dryRun: true,
    verbose: false,
    gitCommit: false,
    gitTag: false,
    stageChanges: false,
  });
  const data = Object.values(result.projectsVersionData);
  const versions = [...new Set(data.map((d) => d.newVersion).filter(Boolean))];
  if (result.workspaceVersion && !versions.includes(result.workspaceVersion)) {
    versions.push(result.workspaceVersion);
  }
  const currents = [...new Set(data.map((d) => d.currentVersion))];
  return {
    versions,
    current: currents.length === 1 ? currents[0] : currents.join(', '),
  };
}

async function main() {
  run('git', [
    'fetch',
    '--quiet',
    '--tags',
    'origin',
    '+refs/heads/main:refs/remotes/origin/main',
  ]);
  const mainSha = run('git', ['rev-parse', 'origin/main']);
  const remote = lines(
    run('git', ['ls-remote', '--tags', '--heads', 'origin']),
  );
  const remoteTags = remote
    .map((line) => line.split('\t')[1])
    .filter((name) => name.startsWith('refs/tags/') && !name.endsWith('^{}'))
    .map((name) => name.slice('refs/tags/'.length));
  const remoteHeads = remote
    .map((line) => line.split('\t')[1])
    .filter((name) => name.startsWith('refs/heads/'))
    .map((name) => name.slice('refs/heads/'.length));

  let mainIsAncestor = true;
  try {
    run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  } catch {
    mainIsAncestor = false;
  }

  const nx = parseJsonc(readFileSync('nx.json', 'utf8'));
  const deploy = JSON.parse(readFileSync('apps/docs/deploy.json', 'utf8'));
  const archives = JSON.parse(readFileSync('apps/docs/archives.json', 'utf8'));
  const mutating = ['rc', 'stable', 'patch'].includes(event);
  const tagsMergedHead = gitTags('--merged', 'HEAD');

  const facts = {
    event,
    ref,
    mainSha,
    dryRun,
    tagsAll: gitTags(),
    tagsMergedHead,
    tagsMergedMain: gitTags('--merged', 'origin/main'),
    remoteTags,
    remoteHeads,
    mainIsAncestor,
    packages: ['sync'].includes(event)
      ? []
      : publishedPackages().map(npmPackage),
    release: {
      relationship: nx.release?.projectsRelationship ?? 'fixed',
      pattern: nx.release?.releaseTag?.pattern ?? 'v{version}',
    },
    deployMode: deploy.mode,
    archiveLines: (archives.archives ?? []).map((entry) => entry.line),
    requiredChecks: mutating ? requiredChecks() : [],
    proposed: event === 'patch' ? await proposedPatch() : null,
    // Looked up below for resume, once the plan names the tag.
    releaseExists: false,
  };

  const plan = planRelease(facts);
  if (plan.fatal) {
    console.log(`::error::${plan.fatal}`);
    summary(`**Release plan failed:** ${plan.fatal}`);
    process.exit(1);
  }

  if (event === 'resume') {
    try {
      run('gh', [
        'release',
        'view',
        plan.outputs.tag,
        '--repo',
        repo,
        '--json',
        'tagName',
      ]);
      plan.outputs.release_exists = 'true';
    } catch {
      plan.outputs.release_exists = 'false';
    }
  }

  plan.outputs.main_sha = mainSha;
  plan.outputs.blocked = plan.blockers.length > 0 ? 'true' : '';
  const output = Object.entries(plan.outputs).map(
    ([key, value]) => `${key}=${value}`,
  );
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `${output.join('\n')}\n`);

  console.log(`Plan for event=${event} on ${ref} (${sha}), dry run ${dryRun}:`);
  for (const line of output) console.log(`  ${line}`);
  summary(
    `### Release plan: ${event} on ${ref}\n\n| output | value |\n| --- | --- |`,
  );
  for (const [key, value] of Object.entries(plan.outputs))
    summary(`| ${key} | \`${value}\` |`);

  if (plan.blockers.length > 0) {
    summary('\n**Blocked:**\n');
    for (const blocker of plan.blockers) {
      console.log(`::error::${blocker}`);
      summary(`- ${blocker}`);
    }
    if (!dryRun) process.exit(1);
    console.log(
      'Dry run: continuing so the preview prints. The run fails at its last step.',
    );
  }
}

main().catch((error) => {
  console.log(`::error::${error.message.split('\n')[0]}`);
  console.error(error);
  process.exit(1);
});
