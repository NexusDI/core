import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { inspect, parseGraph, toDot, toMermaid } from '@nexusdi/devtools';

import { CliError } from './cli-error.js';
import { importFile, resolveFrom } from './resolve.js';

/** The project's @nexusdi/devtools, which runs on the project's copy of core. */
export interface DevtoolsApi {
  readonly inspect: typeof inspect;
  readonly parseGraph: typeof parseGraph;
  readonly toDot: typeof toDot;
  readonly toMermaid: typeof toMermaid;
}

/**
 * @nexusdi/devtools resolved from `fromFile`, never from this package: the
 * user's modules come from the project's core, and inspect() must run on
 * that copy. Throws CliError 3 when it is missing or at another version.
 */
export async function loadDevtools(
  fromFile: string,
  version: string,
): Promise<DevtoolsApi> {
  const manifest = resolveFrom('@nexusdi/devtools/package.json', fromFile);
  const entry = resolveFrom('@nexusdi/devtools', fromFile);
  const found =
    manifest === null
      ? null
      : (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string })
          .version;
  if (entry === null || found !== version)
    throw new CliError(
      3,
      `@nexusdi/devtools ${version} is required next to @nexusdi/cli ${version}; found ${
        found ?? 'none'
      }.`,
      `Install it: npm i -D @nexusdi/devtools@${version}`,
    );
  return importFile<DevtoolsApi>(entry);
}

/**
 * Throws CliError 3 when this package cannot resolve @nexusdi/core, its
 * peer. graph.js imports core, so main checks this before it loads graph.js.
 * Presence only: the CLI uses its copy for isNexusError, whose brand works
 * across copies.
 */
export function requireCore(version: string): void {
  if (resolveFrom('@nexusdi/core', fileURLToPath(import.meta.url)) === null)
    throw new CliError(
      3,
      `@nexusdi/core ${version} is required next to @nexusdi/cli ${version}; found none.`,
      `Install it: npm i -D @nexusdi/core@${version}`,
    );
}
