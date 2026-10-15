import { parseCommand } from './args.js';
import { CliError, formatCliError } from './cli-error.js';
import { requireCore } from './devtools.js';
import { render } from './render.js';
import { cliVersion } from './version.js';
import { checkOut, checkOutputs, emit, writeTo, type Output } from './write.js';

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

Usage: nexusdi profile <entry> [options]

<entry>                  path[#export]: a module file as for graph (the default export when
                         #export is absent), or a .json file holding a ProfileReport or an
                         array of them, re-rendered without running the app
    --load <path#export> a module to load() after create, timed as its own run; repeatable
    --plugins <path#export>
                         an exported array of plugins, registered after the profiler
    --repeat <n>         warm iterations after the first, default 0; the table shows the
                         cold run and the warm medians
    --chrome <file>      write the Chrome DevTools trace of the first iteration
    --perfetto <file>    write the Perfetto trace of the first iteration
    --json <file>        write every iteration's ProfileReport as an array
    --top <n>            rows in the slowest-providers table, default 20
    --timeout <ms>       stop waiting for a create or load, default 60000
    --quiet              no table on stdout

Exit codes: 0 written, 1 invalid graph or failed startup, 2 bad invocation or input, 3 missing tool.
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
    if (command.kind === 'profile') {
      const inputs = [
        command.entry,
        ...command.load,
        ...(command.plugins === null ? [] : [command.plugins]),
      ];
      const outputs = [
        ['--chrome', command.chrome],
        ['--perfetto', command.perfetto],
        ['--json', command.json],
      ] as const;
      for (const [flag, out] of outputs) checkOut(out, inputs, flag);
      checkOutputs(outputs);
      requireCore(version);
      // profile.js loads graph.js, which imports @nexusdi/core.
      const { runProfile } = await import('./profile.js');
      return await runProfile(command, io, version);
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
    checkOut(command.out, [
      command.entry,
      ...command.load,
      ...(command.plugins === null ? [] : [command.plugins]),
    ]);
    requireCore(version);
    // graph.js imports @nexusdi/core, so it loads after the presence check.
    const { graphFor } = await import('./graph.js');
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
