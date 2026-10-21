#!/usr/bin/env node
/**
 * Installs one leg's framework versions over the workspace with --no-save,
 * checks each installed version against the leg's spec and the adapter's
 * peer range, and that the root tree and the adapter hold one copy of it
 * (adapter-peers-check.mjs), then runs the leg's
 * targets with `nx run`, one at a time, skipping the Nx cache: the cache key
 * does not see the installed version (spec 13.4).
 *
 *   node scripts/adapter-peers.mjs <leg>
 *
 * A leg lists packages in `install`, and families of packages that release
 * together in `families`; installSpecs resolves each family to one version.
 *
 * An adapter's own devDependencies pin the workspace's version, so the
 * root install leaves that copy nested under the adapter. The runner
 * removes the nested copy, so the adapter, its tests and the root tools
 * (@testing-library/react, @hono/node-server) all resolve the one root copy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  installSpecs,
  legProblems,
  packageOf,
} from './adapter-peers-check.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const legs = JSON.parse(
  readFileSync(join(ROOT, 'scripts/adapter-peers.json'), 'utf8'),
);
const name = process.argv[2];
const leg = legs[name];
if (!leg)
  throw new Error(
    `unknown leg ${name}; one of ${Object.keys(legs).join(', ')}`,
  );

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NX_NO_CLOUD: 'true', NX_DAEMON: 'false', ...env },
  });

/** The lib folder of a target: `@nexusdi/react:test` is `libs/react`. */
const libOf = (target) =>
  join(ROOT, 'libs', target.slice('@nexusdi/'.length, target.indexOf(':')));

const specs = installSpecs(leg);
console.log(`Leg ${name}: installing ${specs.join(' ')}`);
// The workspace's own tools pin peers on the line a leg replaces (the root
// pins @vitest/ui, @vitest/coverage-v8 and @vitest/browser-playwright to
// exactly 5.0.5, which the vitest-floor and vitest-4-latest legs replace with
// 4.x, @nx/react 23.3.0 peers express ^4.21.2 where the express legs install 5,
// libs/react and libs/react-router pin @react-router/dev ^8.4.0 and
// examples/react-ssr pins @react-router/dev, @react-router/node and
// @react-router/serve at exactly 8.4.0, which react-router-8-latest replaces
// with the newest 8.x, and its peer range ^8.5.0 conflicts with those pins), and
// the leg tests one adapter, so legacyPeerDeps skips npm's peer checks. The
// runner repeats them for the packages the leg installs (legProblems).
run('npm', [
  'install',
  '--no-save',
  '--no-audit',
  '--no-fund',
  ...(leg.legacyPeerDeps ? ['--legacy-peer-deps'] : []),
  ...specs,
]);

const packages = specs.map(packageOf);
const libs = [...new Set(leg.targets.map(libOf))];
for (const lib of libs)
  for (const pkg of packages) {
    const nested = join(lib, 'node_modules', pkg);
    if (existsSync(nested)) rmSync(nested, { recursive: true, force: true });
  }

const problems = legProblems(ROOT, specs, libs, leg.peerExceptions);
for (const problem of problems) console.error(`  ${problem}`);
if (problems.length > 0)
  throw new Error(`leg ${name}: ${problems.length} problem(s) after install`);
for (const pkg of packages)
  console.log(
    `  ${pkg} ${JSON.parse(readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version}, one copy`,
  );

if (leg.browsers)
  run('npx', ['playwright', 'install', '--with-deps', 'chromium']);
for (const target of leg.targets)
  run('npx', ['nx', 'run', target, '--skip-nx-cache'], leg.env ?? {});
