/**
 * Moves the npm dist-tags a publish leaves behind (release spec sections 5.2
 * step 6 and 5.4 step 8). reconcileCommands in lib.mjs decides the moves.
 *
 * The npm CLI performs the OIDC exchange for `npm publish` only, so
 * `npm dist-tag add` in this job has no credential of its own. This script
 * does the exchange npm's publish does (npm lib/utils/oidc.js): a GitHub ID
 * token for the audience npm:registry.npmjs.org, posted to the registry's
 * per-package exchange endpoint. The returned token is masked, passed to npm
 * through its environment and never written to disk. The trusted publisher
 * must have the "Allow npm dist-tag" permission.
 *
 * Never fails the run. A move that does not happen prints the command for the
 * owner to run locally with an OTP. A dry run prints the moves only.
 *
 * Environment: VERSION, DIST_TAG, RESUME, DRY_RUN, and in Actions
 * ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reconcileCommands } from './lib.mjs';

const REGISTRY = 'https://registry.npmjs.org';
const env = process.env;

const summary = (text) => {
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

function packageNames() {
  return readdirSync('libs', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [
          JSON.parse(
            readFileSync(join('libs', entry.name, 'package.json'), 'utf8'),
          ),
        ];
      } catch {
        return [];
      }
    })
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => manifest.name);
}

function npmPackage(name) {
  try {
    const data = JSON.parse(
      execFileSync('npm', ['view', name, 'versions', 'dist-tags', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    const versions = data.versions ?? [];
    return {
      name,
      versions: Array.isArray(versions) ? versions : [versions],
      distTags: data['dist-tags'] ?? {},
    };
  } catch (error) {
    // Only a package npm has never seen reads as empty. Any other failure
    // stops the reconcile: an empty record would look like a package with no
    // stable version and move its latest onto a prerelease.
    if (/E404/.test(`${error.stdout ?? ''}${error.stderr ?? ''}`)) {
      return { name, versions: [], distTags: {} };
    }
    throw new Error(`npm view ${name} failed`);
  }
}

async function exchange(name) {
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.append('audience', 'npm:registry.npmjs.org');
  const id = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
  });
  if (!id.ok) throw new Error(`GitHub refused an ID token (${id.status})`);
  const { value } = await id.json();
  const escaped = name.replace('/', '%2f');
  const response = await fetch(
    `${REGISTRY}/-/npm/v1/oidc/token/exchange/package/${escaped}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${value}` },
    },
  );
  if (!response.ok)
    throw new Error(
      `npm refused the token exchange (${response.status}: ${await response.text()})`,
    );
  const { token } = await response.json();
  if (!token) throw new Error('npm returned no token');
  console.log(`::add-mask::${token}`);
  return token;
}

async function main() {
  const version = env.VERSION ?? '';
  const moves = reconcileCommands({
    packages: packageNames().map(npmPackage),
    version,
    distTag: env.DIST_TAG ?? '',
    resume: env.RESUME === 'true',
  });
  if (moves.length === 0) {
    console.log('No dist-tag to move.');
    return;
  }

  const failed = [];
  for (const move of moves) {
    const command = `npm dist-tag add ${move.name}@${move.version} ${move.tag}`;
    if (env.DRY_RUN === 'true') {
      console.log(`Would run: ${command}`);
      continue;
    }
    try {
      const token = await exchange(move.name);
      execFileSync(
        'npm',
        ['dist-tag', 'add', `${move.name}@${move.version}`, move.tag],
        {
          stdio: 'inherit',
          env: { ...env, 'npm_config_//registry.npmjs.org/:_authToken': token },
        },
      );
      console.log(`Moved ${move.tag} to ${move.name}@${move.version}.`);
    } catch (error) {
      console.log(`::warning::${command} failed: ${error.message}`);
      failed.push(command);
    }
  }

  if (failed.length > 0) {
    const text = [
      '### Dist-tags to move by hand',
      '',
      'The release is published. Run these locally, logged in to npm:',
      '',
      '```sh',
      ...failed.map((command) => `${command} --otp=<code>`),
      '```',
    ].join('\n');
    console.log(text);
    summary(text);
  }
}

main().catch((error) => {
  console.log(`::warning::dist-tag reconcile failed: ${error.message}`);
});
