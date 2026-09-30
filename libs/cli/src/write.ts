import { statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import { CliError } from './cli-error.js';
import type { EntryRef } from './entry.js';

/** The part of a writable stream the CLI uses; process.stdout satisfies it. */
export interface Output {
  write(
    chunk: string | Uint8Array,
    callback: (error?: Error | null) => void,
  ): boolean;
  readonly isTTY?: boolean;
}

/**
 * Resolves once the stream has flushed `data`, so process.exit cannot cut it
 * short. EPIPE resolves too: the reader closed early (`nexusdi graph | head`)
 * after taking what it wanted, and the CLI exits 0 as `git log | head` does.
 */
export function writeTo(
  stream: Output,
  data: string | Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(data, (error) =>
      error && (error as NodeJS.ErrnoException).code !== 'EPIPE'
        ? reject(error)
        : resolve(),
    );
  });
}

/** The file's device and inode, or null when it does not exist. */
function identity(path: string): string | null {
  const stat = statSync(path, { throwIfNoEntry: false, bigint: true });
  return stat === undefined ? null : `${stat.dev}:${stat.ino}`;
}

/**
 * Throws CliError 2 when --out is one of the run's input files. Compares
 * device and inode, so another spelling of the path on a case-insensitive
 * volume, or a link to the file, counts as the same file.
 */
export function checkOut(
  out: string | null,
  inputs: readonly EntryRef[],
): void {
  if (out === null) return;
  const target = identity(out);
  if (target === null) return;
  const input = inputs.find((ref) => identity(ref.path) === target);
  if (input !== undefined)
    throw new CliError(
      2,
      `--out ${out} is ${input.shown}, an input to this run.`,
      'Pass another --out file.',
    );
}

export async function emit(
  data: string | Uint8Array,
  out: string | null,
  stdout: Output,
): Promise<void> {
  if (out === null) {
    try {
      await writeTo(stdout, data);
    } catch (error) {
      throw new CliError(
        2,
        `cannot write to stdout: ${(error as Error).message}`,
        'Pass --out to write to a file.',
      );
    }
    return;
  }
  try {
    await writeFile(out, data);
  } catch (error) {
    throw new CliError(
      2,
      `cannot write ${out}: ${(error as Error).message}`,
      'Check that the directory exists and is writable.',
    );
  }
}
