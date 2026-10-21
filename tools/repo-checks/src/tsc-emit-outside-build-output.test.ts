import { createProjectGraphAsync, parseJson, workspaceRoot } from '@nx/devkit';
import type { ProjectGraphProjectNode, TargetConfiguration } from '@nx/devkit';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `typecheck` is `tsc --build` over the solution tsconfig.json, so it emits
 * declarations for every project that file references. Nothing consumes that
 * emit -- it exists because `tsc --build` has no check-only mode -- but it
 * still lands on disk, and Nx schedules `typecheck` and `build` concurrently
 * because neither depends on the other.
 *
 * If the two write the same directory they corrupt each other. A vite library
 * build empties its outDir before writing, which deletes the declarations tsc
 * has just emitted and is about to read for the next project in the solution,
 * and tsc reports TS6305. The same overlap also makes the `build` target's Nx
 * cache artifact depend on whether `typecheck` happened to run first.
 *
 * The rule: tsc may emit into a directory another target declares as its
 * output only when that target is the same `tsc --build` over the same
 * config, which is one compiler producing one artifact rather than two
 * producers sharing a directory.
 */

interface TsConfig {
  compilerOptions?: { outDir?: string; tsBuildInfoFile?: string };
  references?: { path: string }[];
}

function readTsConfig(file: string): TsConfig {
  return parseJson<TsConfig>(readFileSync(file, 'utf-8'), {
    expectComments: true,
  });
}

/** `./tsconfig.lib.json` and `./some-dir` both resolve to a config file path. */
function resolveConfigPath(fromDir: string, ref: string): string {
  const target = resolve(fromDir, ref);
  return existsSync(target) && !target.endsWith('.json')
    ? join(target, 'tsconfig.json')
    : target;
}

/** Absolute paths `tsc --build` writes when driven from `entry`, including it. */
function emitPaths(entry: string): { config: string; paths: string[] }[] {
  const seen = new Set<string>();
  const out: { config: string; paths: string[] }[] = [];
  const queue = [entry];

  while (queue.length > 0) {
    const config = queue.shift() as string;
    if (seen.has(config) || !existsSync(config)) continue;
    seen.add(config);

    const { compilerOptions = {}, references = [] } = readTsConfig(config);
    const dir = dirname(config);
    const paths = [compilerOptions.outDir, compilerOptions.tsBuildInfoFile]
      .filter((p): p is string => typeof p === 'string')
      .map((p) => resolve(dir, p));

    if (paths.length > 0) out.push({ config, paths });
    for (const reference of references) {
      queue.push(resolveConfigPath(dir, reference.path));
    }
  }

  return out;
}

/** The directory part of an Nx output entry, with its tokens expanded. */
function outputDir(output: string, projectRoot: string): string | undefined {
  const expanded = output
    .replace('{workspaceRoot}', workspaceRoot)
    .replace('{projectRoot}', join(workspaceRoot, projectRoot));
  if (!isAbsolute(expanded)) return undefined;

  // `dist/**/*.d.ts` covers `dist`, not its parent, so cut at the last
  // separator before the first glob character rather than taking a dirname of
  // the truncated string, which would drop a trailing-slash segment.
  const glob = expanded.search(/[*?{]/);
  return glob === -1
    ? expanded
    : expanded.slice(0, glob).replace(/\/[^/]*$/, '');
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The command a run-commands target starts with: `options.command`, or the
 * first entry of `options.commands`, which Nx accepts as a string or as
 * `{ command }`.
 */
function firstCommand(target: TargetConfiguration): string {
  const options = target.options as
    { command?: unknown; commands?: unknown } | undefined;
  if (options?.command !== undefined) return String(options.command);
  const first: unknown = Array.isArray(options?.commands)
    ? options.commands[0]
    : undefined;
  if (typeof first === 'object' && first !== null && 'command' in first)
    return String(first.command);
  return first === undefined ? '' : String(first);
}

/**
 * A target is the same compiler producing the same artifact when it is
 * `tsc --build` naming that very config, so its emit is not a second producer.
 * A target with several commands counts when its first command is that build,
 * as libs/cli's build is: tsc, then a chmod of the bin.
 */
function buildsConfigItself(
  target: TargetConfiguration,
  config: string,
  projectRoot: string,
): boolean {
  const command = firstCommand(target);
  if (!command.startsWith('tsc --build')) return false;

  return command
    .split(/\s+/)
    .slice(2)
    .some(
      (arg) =>
        !arg.startsWith('-') &&
        resolve(workspaceRoot, projectRoot, arg) === config,
    );
}

/**
 * A solution tsconfig reaches across project boundaries, so a config's emit is
 * judged against the targets of the project that owns it -- the deepest
 * project root containing it.
 */
function ownerOf(
  config: string,
  projects: ProjectGraphProjectNode[],
): ProjectGraphProjectNode | undefined {
  return projects
    .filter((p) => isInside(config, join(workspaceRoot, p.data.root)))
    .sort((a, b) => b.data.root.length - a.data.root.length)[0];
}

function collisions(
  project: ProjectGraphProjectNode,
  projects: ProjectGraphProjectNode[],
): string[] {
  if (!project.data.targets?.['typecheck']) return [];

  const entry = join(workspaceRoot, project.data.root, 'tsconfig.json');
  const found: string[] = [];

  for (const { config, paths } of emitPaths(entry)) {
    const owner = ownerOf(config, projects);
    if (!owner) continue;
    const { root, targets = {} } = owner.data;

    for (const [name, target] of Object.entries(targets)) {
      if (name === 'typecheck' || !target.outputs) continue;
      if (buildsConfigItself(target, config, root)) continue;

      for (const output of target.outputs) {
        const dir = outputDir(output, root);
        if (!dir) continue;

        for (const path of paths) {
          if (isInside(path, dir)) {
            found.push(
              `${project.name}: ${relative(workspaceRoot, config)} emits to ` +
                `${relative(workspaceRoot, path)}, inside ${owner.name}'s ` +
                `'${name}' target output ${output}`,
            );
          }
        }
      }
    }
  }

  return found;
}

describe('buildsConfigItself', () => {
  const config = resolve(workspaceRoot, 'libs/cli/tsconfig.lib.json');
  const target = (options: Record<string, unknown>): TargetConfiguration => ({
    executor: 'nx:run-commands',
    options,
  });

  it('reads options.command', () => {
    expect(
      buildsConfigItself(
        target({ command: 'tsc --build tsconfig.lib.json' }),
        config,
        'libs/cli',
      ),
    ).toBe(true);
  });

  it('reads the first entry of options.commands, as a string or as { command }', () => {
    const chmod =
      "node -e \"require('node:fs').chmodSync('dist/bin.js', 0o755)\"";
    expect(
      buildsConfigItself(
        target({ commands: ['tsc --build tsconfig.lib.json', chmod] }),
        config,
        'libs/cli',
      ),
    ).toBe(true);
    expect(
      buildsConfigItself(
        target({
          commands: [{ command: 'tsc --build tsconfig.lib.json' }, chmod],
        }),
        config,
        'libs/cli',
      ),
    ).toBe(true);
  });

  it('refuses a build of another config, or a tsc build that is not the first command', () => {
    expect(
      buildsConfigItself(
        target({ commands: ['tsc --build tsconfig.spec.json'] }),
        config,
        'libs/cli',
      ),
    ).toBe(false);
    expect(
      buildsConfigItself(
        target({ commands: ['vite build', 'tsc --build tsconfig.lib.json'] }),
        config,
        'libs/cli',
      ),
    ).toBe(false);
  });
});

describe('tsc emit locations', () => {
  it('stay out of directories another target owns', async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    const projects = Object.values(graph.nodes);

    expect(
      projects.length,
      'the project graph resolved no projects',
    ).toBeGreaterThan(0);

    const found = projects.flatMap((p) => collisions(p, projects)).sort();

    expect(
      found,
      `Point the tsconfig's outDir and tsBuildInfoFile at out-tsc/. ` +
        `Two targets writing one directory run concurrently and corrupt ` +
        `each other's output.`,
    ).toEqual([]);
  });
});
