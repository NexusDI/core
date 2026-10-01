import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ASSETS, cliGraph, type AssetFormat } from './assets.ts';

// Writes libs/devtools/assets/graph.{dot,svg} from the fixture app.
// Run it through `nx run @nexusdi/readme-assets:generate`, which builds the cli first.
for (const format of Object.keys(ASSETS) as AssetFormat[]) {
  mkdirSync(dirname(ASSETS[format]), { recursive: true });
  writeFileSync(ASSETS[format], cliGraph(format));
  process.stdout.write(`wrote ${ASSETS[format]}\n`);
}
