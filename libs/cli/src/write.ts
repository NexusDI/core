import { writeFile } from 'node:fs/promises';

import { CliError } from './cli-error.js';

/** The part of a writable stream the CLI uses; process.stdout satisfies it. */
export interface Output {
  write(
    chunk: string | Uint8Array,
    callback: (error?: Error | null) => void,
  ): boolean;
  readonly isTTY?: boolean;
}

/** Resolves once the stream has flushed `data`, so process.exit cannot cut it short. */
export function writeTo(
  stream: Output,
  data: string | Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(data, (error) => (error ? reject(error) : resolve()));
  });
}

export async function emit(
  data: string | Uint8Array,
  out: string | null,
  stdout: Output,
): Promise<void> {
  if (out === null) return writeTo(stdout, data);
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
