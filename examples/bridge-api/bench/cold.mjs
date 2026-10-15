import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { build } from 'esbuild';

// Under the example's gitignored tmp/, so esbuild resolves @nexusdi/core
// through the workspace's node_modules.
const tmp = join(import.meta.dirname, '..', 'tmp');
mkdirSync(tmp, { recursive: true });
const dir = mkdtempSync(join(tmp, 'cold-'));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  `import { Nexus } from '@nexusdi/core';
import { OfflineMeridian } from '${new URL('../src/ship/meridian.ts', import.meta.url).pathname}';
const start = performance.now();
const ship = await Nexus.create(OfflineMeridian);
console.log(performance.now() - start);
await ship[Symbol.asyncDispose]();
`,
);
const outfile = join(dir, 'cold.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'error',
});

const runs = Array.from({ length: 25 }, () =>
  Number(execFileSync(process.execPath, [outfile]).toString().trim()),
);
runs.sort((a, b) => a - b);
console.log(
  `cold Nexus.create(OfflineMeridian), median of 25 processes: ${runs[12].toFixed(2)} ms`,
);
rmSync(dir, { recursive: true, force: true });
