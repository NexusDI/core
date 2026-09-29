#!/usr/bin/env node
/**
 * Type-checks the source and the *.test-d.ts files of @nexusdi/core and
 * @nexusdi/decorators with the oldest TypeScript the packages support (5.4,
 * for NoInfer) and with TypeScript 7, the Go compiler. Vitest's typecheck
 * mode runs the same files on the workspace's TypeScript; this covers the two
 * ends of the range. The decorators config reads core through its
 * @nexusdi/source condition, so it needs no build.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECTS = [
  ['@nexusdi/core', 'libs/core/tsconfig.floor.json'],
  ['@nexusdi/decorators', 'libs/decorators/tsconfig.floor.json'],
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
