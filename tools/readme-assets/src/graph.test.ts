import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ASSETS, cliGraph, type AssetFormat } from './assets.ts';

const STALE =
  'The README graph is stale. Run: nx run @nexusdi/readme-assets:generate';

/**
 * The devtools and cli READMEs show libs/devtools/assets/graph.svg. The cli
 * draws it from src/meridian.module.ts, and @viz-js/viz (Graphviz compiled to
 * WebAssembly, with its own font metrics) renders the same DOT to the same
 * bytes on every host, so both files are compared byte for byte.
 */
describe('the README graph', () => {
  it.each(Object.keys(ASSETS) as AssetFormat[])(
    'equals what the cli writes as %s today',
    (format) => {
      expect(cliGraph(format).equals(readFileSync(ASSETS[format])), STALE).toBe(
        true,
      );
    },
  );

  it('keeps the white background, so it reads on light and dark pages', () => {
    expect(readFileSync(ASSETS.svg, 'utf8')).toMatch(/<polygon fill="white"/);
  });

  it('draws both modules and every token with its class', () => {
    const dot = readFileSync(ASSETS.dot, 'utf8');
    for (const label of [
      'label="Bridge"',
      'label="Engineering"',
      'Helm\\nBridgeHelm',
      'ShipLog\\nCaptainsLog',
      'ShipComputer\\nMainComputer',
      'Reactor\\nFusionReactor',
      'NavCharts\\nfactory',
    ])
      expect(dot).toContain(label);
  });
});
