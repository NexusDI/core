#!/usr/bin/env node
/**
 * Type-checks @nexusdi/core's source and its *.test-d.ts files with the
 * oldest TypeScript the package supports (5.4, for NoInfer) and with
 * TypeScript 7, the Go compiler. Vitest's typecheck mode runs the same files
 * on the workspace's TypeScript; this covers the two ends of the range.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECT = 'libs/core/tsconfig.floor.json';

const checks = [
  ['TypeScript 5.4', ['--yes', '-p', 'typescript@5.4.5', 'tsc', '-p', PROJECT]],
  ['TypeScript 7', ['--yes', '-p', 'typescript@7.0.2', 'tsc', '-p', PROJECT]],
];

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
