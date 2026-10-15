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
 * An adapter's own devDependencies pin the workspace's version, so the
 * root install leaves that copy nested under the adapter. The runner
 * removes the nested copy, so the adapter, its tests and the root tools
 * (@testing-library/react, @hono/node-server) all resolve the one root copy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { legProblems, packageOf } from './adapter-peers-check.mjs';

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

console.log(`Leg ${name}: installing ${leg.install.join(' ')}`);
// The workspace's own tools pin peers on the line a leg replaces (@nx/vitest
// wants vitest ^4, @vitest/browser-playwright an exact 4.1.9, and libs/react
// and examples/react-ssr @react-router/dev ^8), and the leg tests one adapter,
// so npm skips those tools' peer checks.
run('npm', [
  'install',
  '--no-save',
  '--no-audit',
  '--no-fund',
  ...(leg.legacyPeerDeps ? ['--legacy-peer-deps'] : []),
  ...leg.install,
]);

const packages = leg.install.map(packageOf);
const libs = [...new Set(leg.targets.map(libOf))];
for (const lib of libs)
  for (const pkg of packages) {
    const nested = join(lib, 'node_modules', pkg);
    if (existsSync(nested)) rmSync(nested, { recursive: true, force: true });
  }

const problems = legProblems(ROOT, leg.install, libs);
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
