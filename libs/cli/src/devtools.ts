import { readFileSync } from 'node:fs';

import type { inspect, toDot, toMermaid } from '@nexusdi/devtools';

import { CliError } from './cli-error.js';
import { importFile, resolveFrom } from './resolve.js';

/** The project's @nexusdi/devtools, which runs on the project's copy of core. */
export interface DevtoolsApi {
  readonly inspect: typeof inspect;
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
