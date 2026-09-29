/** 1: the graph is invalid. 2: the invocation or the input is wrong. 3: the environment lacks something. */
export type ExitCode = 1 | 2 | 3;

/** A failure the CLI classified, with the line that fixes it. */
export class CliError extends Error {
  constructor(
    readonly exitCode: ExitCode,
    message: string,
    readonly fix: string | null = null,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function formatCliError(error: CliError): string {
  return `nexusdi: ${error.message}\n${
    error.fix === null ? '' : `  ${error.fix}\n`
  }`;
}
