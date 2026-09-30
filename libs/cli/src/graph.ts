import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isNexusError } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';

import type { GraphCommand } from './args.js';
import { CliError } from './cli-error.js';
import { loadDevtools, type DevtoolsApi } from './devtools.js';
import { entryKind, type EntryRef } from './entry.js';
import { pickExport, type ExportUse } from './exports.js';
import { importEntry, prepareLoader } from './load.js';

export interface GraphResult {
  readonly graph: NexusGraph;
  readonly devtools: DevtoolsApi;
  /** The file peers resolve from. */
  readonly from: string;
}

/**
 * The CliError for an error inspect() threw, or null for an error the CLI
 * does not classify. Any NexusError is classified, a third party's included.
 */
export function inspectFailure(error: unknown): CliError | null {
  if (!isNexusError(error)) return null;
  if (isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
    return new CliError(1, error.message);
  // Core throws some input errors before it compiles, such as an object
  // root with keys other than providers, imports and exports. The input is
  // wrong and no graph was checked, so exit 2. Core's message ends in its
  // Fix line.
  return new CliError(2, error.message);
}

/**
 * The NexusGraph in a .json file's text. The project's devtools checks the
 * schema. Throws CliError 2 for text that is not JSON or not a NexusGraph.
 */
function readGraph(
  text: string,
  shown: string,
  devtools: DevtoolsApi,
): NexusGraph {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CliError(
      2,
      `${shown} is not JSON: ${(error as Error).message}`,
      'Write the file with JSON.stringify(graph(ship)) from @nexusdi/devtools.',
    );
  }
  try {
    return devtools.parseGraph(value);
  } catch (error) {
    // devtools' message ends in its Fix line.
    if (isNexusError(error))
      throw new CliError(2, `${shown}: ${error.message}`);
    throw error;
  }
}

export async function graphFor(
  command: GraphCommand,
  cwd: string,
  version: string,
): Promise<GraphResult> {
  if (entryKind(command.entry) === 'json') {
    const from = join(cwd, 'package.json');
    const devtools = await loadDevtools(from, version);
    let text: string;
    try {
      text = await readFile(command.entry.path, 'utf8');
    } catch {
      throw new CliError(
        2,
        `${command.entry.shown} does not exist.`,
        'Pass a file written with JSON.stringify(graph(ship)).',
      );
    }
    return {
      graph: readGraph(text, command.entry.shown, devtools),
      devtools,
      from,
    };
  }

  const refs = [
    command.entry,
    ...command.load,
    ...(command.plugins === null ? [] : [command.plugins]),
  ];
  for (const ref of refs) await prepareLoader(ref);
  const devtools = await loadDevtools(command.entry.path, version);

  const namespaces = new Map<string, Record<string, unknown>>();
  const exportOf = async (ref: EntryRef, use?: ExportUse): Promise<unknown> => {
    let namespace = namespaces.get(ref.path);
    if (namespace === undefined) {
      namespace = await importEntry(ref);
      namespaces.set(ref.path, namespace);
    }
    return pickExport(namespace, ref, use);
  };

  const root = await exportOf(command.entry);
  const load: unknown[] = [];
  for (const ref of command.load)
    load.push(await exportOf(ref, { via: '--load' }));
  let plugins: unknown[] | undefined;
  if (command.plugins !== null) {
    const value = await exportOf(command.plugins, {
      via: '--plugins',
      fits: Array.isArray,
    });
    if (!Array.isArray(value))
      throw new CliError(
        2,
        `${command.plugins.shown}#${
          command.plugins.exportName ?? 'default'
        } is not an array of plugins.`,
        'Export the array you pass to Nexus.create: export const plugins = [federation()];',
      );
    plugins = value;
  }

  try {
    const graph = devtools.inspect(root as never, {
      load: load as never,
      ...(plugins === undefined ? {} : { plugins: plugins as never }),
    });
    return { graph, devtools, from: command.entry.path };
  } catch (error) {
    throw inspectFailure(error) ?? error;
  }
}
