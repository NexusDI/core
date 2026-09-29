import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NexusGraph } from '@nexusdi/devtools';

import type { GraphCommand } from './args.js';
import { CliError } from './cli-error.js';
import { loadDevtools, type DevtoolsApi } from './devtools.js';
import { entryKind, type EntryRef } from './entry.js';
import { pickExport } from './exports.js';
import { parseGraphJson } from './graph-json.js';
import { importEntry, prepareLoader } from './load.js';

export interface GraphResult {
  readonly graph: NexusGraph;
  readonly devtools: DevtoolsApi;
  /** The file peers resolve from. */
  readonly from: string;
}

function isBlueprintError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'NEXUS_BLUEPRINT_INVALID'
  );
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
    return { graph: parseGraphJson(text, command.entry.shown), devtools, from };
  }

  const refs = [
    command.entry,
    ...command.load,
    ...(command.plugins === null ? [] : [command.plugins]),
  ];
  for (const ref of refs) await prepareLoader(ref);
  const devtools = await loadDevtools(command.entry.path, version);

  const namespaces = new Map<string, Record<string, unknown>>();
  const exportOf = async (ref: EntryRef): Promise<unknown> => {
    let namespace = namespaces.get(ref.path);
    if (namespace === undefined) {
      namespace = await importEntry(ref);
      namespaces.set(ref.path, namespace);
    }
    return pickExport(namespace, ref);
  };

  const root = await exportOf(command.entry);
  const load: unknown[] = [];
  for (const ref of command.load) load.push(await exportOf(ref));
  let plugins: unknown[] | undefined;
  if (command.plugins !== null) {
    const value = await exportOf(command.plugins);
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
    if (isBlueprintError(error)) throw new CliError(1, error.message);
    throw error;
  }
}
