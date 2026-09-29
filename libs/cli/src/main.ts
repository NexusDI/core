import { parseCommand } from './args.js';
import { CliError, formatCliError } from './cli-error.js';
import { graphFor } from './graph.js';
import { render } from './render.js';
import { cliVersion } from './version.js';
import { emit, writeTo, type Output } from './write.js';

export interface Io {
  readonly stdout: Output;
  readonly stderr: Output;
  readonly cwd: string;
}

export const USAGE = `Usage: nexusdi graph <entry> [options]

<entry>                  path[#export]: a .ts, .mts, .cts, .js, .mjs or .cjs file
                         (default export when #export is absent), or a .json NexusGraph
-f, --format <format>    mermaid | dot | json | svg | png
                         (default: from --out's extension, else mermaid)
-o, --out <file>         write to a file; stdout when absent
    --view <view>        providers (default) | modules
    --load <path#export> a module to compile after the root; repeatable
    --plugins <path#export>
                         an exported array of plugins to register
-h, --help               print this help
-v, --version            print the version

Exit codes: 0 written, 1 invalid graph, 2 bad invocation or input, 3 missing tool.
`;

/** Runs one command and returns its exit code. Writes nothing after it returns. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  try {
    const command = parseCommand(argv, io.cwd);
    if (command.kind === 'help') {
      await writeTo(io.stdout, USAGE);
      return 0;
    }
    const version = cliVersion();
    if (command.kind === 'version') {
      await writeTo(io.stdout, `${version}\n`);
      return 0;
    }
    if (
      command.format === 'png' &&
      command.out === null &&
      io.stdout.isTTY === true
    )
      throw new CliError(
        2,
        'PNG is binary, and stdout is a terminal.',
        'Pass --out graph.png, or pipe the output.',
      );
    const { graph, devtools, from } = await graphFor(command, io.cwd, version);
    const data = await render(
      graph,
      command.format,
      command.view,
      devtools,
      from,
    );
    await emit(data, command.out, io.stdout);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      await writeTo(io.stderr, formatCliError(error));
      return error.exitCode;
    }
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await writeTo(io.stderr, `nexusdi: unexpected error\n${detail}\n`);
    return 2;
  }
}
