import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fixture app and the root module the graph starts from. */
const ENTRY = `${fileURLToPath(
  new URL('./meridian.module.ts', import.meta.url),
)}#Bridge`;

/**
 * The `nexusdi` bin as @nexusdi/cli's package.json names it. It points into
 * the cli's dist, which the generate and test targets build through ^build.
 */
function cliBin(): string {
  const manifest = createRequire(import.meta.url).resolve(
    '@nexusdi/cli/package.json',
  );
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    bin: { nexusdi: string };
  };
  return join(dirname(manifest), bin.nexusdi);
}

/** Where the README graph lives. devtools' and cli's READMEs both show it. */
export const ASSETS = {
  dot: fileURLToPath(
    new URL('../../../libs/devtools/assets/graph.dot', import.meta.url),
  ),
  svg: fileURLToPath(
    new URL('../../../libs/devtools/assets/graph.svg', import.meta.url),
  ),
} as const;

export type AssetFormat = keyof typeof ASSETS;

/** What `nexusdi graph <ENTRY> -f <format>` writes to stdout. */
export function cliGraph(format: AssetFormat): Buffer {
  const result = spawnSync(
    process.execPath,
    [cliBin(), 'graph', ENTRY, '-f', format],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `nexusdi graph -f ${format} exited ${String(result.status)}:\n${result.stderr.toString()}`,
    );
  return result.stdout;
}
