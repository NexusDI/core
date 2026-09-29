import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The built bin; the test target depends on build. */
export const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
export const FIXTURES = fileURLToPath(
  new URL('../test-fixtures/', import.meta.url),
);

export interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly bytes: Buffer;
}

/** Runs `node [nodeArgs] dist/bin.js [args]` in `cwd` and waits for it. */
export function runCli(
  args: readonly string[],
  options: { cwd: string; nodeArgs?: readonly string[]; timeout?: number },
): Run {
  const result = spawnSync(
    process.execPath,
    [...(options.nodeArgs ?? []), BIN, ...args],
    { cwd: options.cwd, timeout: options.timeout ?? 30_000 },
  );
  return {
    status: result.status,
    stdout: result.stdout.toString('utf8'),
    stderr: result.stderr.toString('utf8'),
    bytes: result.stdout,
  };
}
