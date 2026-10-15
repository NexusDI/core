#!/usr/bin/env node
/**
 * Type-checks the source and the *.test-d.ts files of @nexusdi/core,
 * @nexusdi/decorators, @nexusdi/devtools and the adapters (@nexusdi/express,
 * @nexusdi/fastify, @nexusdi/hono, @nexusdi/react-router, @nexusdi/vitest and
 * @nexusdi/react) with the oldest TypeScript the packages support (5.4, for
 * NoInfer) and with TypeScript 7, the Go compiler. Each floor config lists
 * esnext.disposable, which the packages' declarations use.
 * Vitest's typecheck mode runs the same files on the workspace's TypeScript;
 * this covers the two ends of the range. devtools holds
 * plugin-api-1.test-d.ts, the third-party plugin that uses every plugin API 1
 * contribution point. The decorators and devtools configs read core and
 * @nexusdi/errors through their @nexusdi/source condition, so they need no
 * build.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECTS = [
  ['@nexusdi/core', 'libs/core/tsconfig.floor.json'],
  ['@nexusdi/decorators', 'libs/decorators/tsconfig.floor.json'],
  ['@nexusdi/devtools', 'libs/devtools/tsconfig.floor.json'],
  ['@nexusdi/express', 'libs/express/tsconfig.floor.json'],
  ['@nexusdi/fastify', 'libs/fastify/tsconfig.floor.json'],
  ['@nexusdi/hono', 'libs/hono/tsconfig.floor.json'],
  ['@nexusdi/react-router', 'libs/react-router/tsconfig.floor.json'],
  ['@nexusdi/vitest', 'libs/vitest/tsconfig.floor.json'],
  ['@nexusdi/react', 'libs/react/tsconfig.floor.json'],
];
const COMPILERS = [
  ['TypeScript 5.4', 'typescript@5.4.5'],
  ['TypeScript 7', 'typescript@7.0.2'],
];

const checks = PROJECTS.flatMap(([name, project]) =>
  COMPILERS.map(([label, compiler]) => [
    `${name}, ${label}`,
    ['--yes', '-p', compiler, 'tsc', '-p', project],
  ]),
);

let failed = false;
for (const [label, args] of checks) {
  try {
    execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ✓ ${label}`);
  } catch {
    console.error(`  ✗ ${label}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
