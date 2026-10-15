import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
 * Whether the volume holding `dir` finds it under another letter case. The
 * check swaps the case of every letter in the path and compares device and
 * inode; a path with no letters counts as case-sensitive.
 */
function caseInsensitive(dir: string): boolean {
  const variant = dir.replace(/[a-z]/gi, (c) =>
    c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
  );
  return variant !== dir && identity(variant) === identity(dir);
}

/**
 * Throws CliError 2 before a run when two outputs name one file, or when an
 * output's directory does not exist or is not writable, so a bad path fails
 * at once and not after the startup it would have recorded. Each entry is a
 * flag and its absolute path, or null for an output not asked for. Two paths
 * name one file when their real directories and basenames match, compared
 * without case on a case-insensitive volume.
 */
export function checkOutputs(
  outputs: readonly (readonly [flag: string, out: string | null])[],
): void {
  const seen = new Map<string, string>();
  let folds: boolean | undefined;
  for (const [flag, out] of outputs) {
    if (out === null) continue;
    const dir = dirname(out);
    const stat = statSync(dir, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory())
      throw new CliError(
        2,
        `${flag} ${out}: the directory ${dir} does not exist.`,
        `Create it, or pass a ${flag} file in a directory that exists.`,
      );
    try {
      accessSync(dir, constants.W_OK);
    } catch {
      throw new CliError(
        2,
        `${flag} ${out}: the directory ${dir} is not writable.`,
        `Pass a ${flag} file in a directory you can write to.`,
      );
    }
    const real = realpathSync(dir);
    folds ??= caseInsensitive(real);
    const path = join(real, basename(out));
    const key = folds ? path.toLowerCase() : path;
    const other = seen.get(key);
    if (other !== undefined)
      throw new CliError(
        2,
        `${other} and ${flag} both write ${out}.`,
        `Pass another ${flag} file.`,
      );
    seen.set(key, flag);
  }
}

/**
 * Throws CliError 2 when --out is one of the run's input files. Compares
 * device and inode, so another spelling of the path on a case-insensitive
 * volume, or a link to the file, counts as the same file.
 */
export function checkOut(
  out: string | null,
  inputs: readonly EntryRef[],
  flag = '--out',
): void {
  if (out === null) return;
  const target = identity(out);
  if (target === null) return;
  const input = inputs.find((ref) => identity(ref.path) === target);
  if (input !== undefined)
    throw new CliError(
      2,
      `${flag} ${out} is ${input.shown}, an input to this run.`,
      `Pass another ${flag} file.`,
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
