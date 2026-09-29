import type { NexusGraph } from '@nexusdi/devtools';

import type { Format, View } from './args.js';
import { CliError } from './cli-error.js';
import type { DevtoolsApi } from './devtools.js';
import { importPeer } from './resolve.js';

interface Viz {
  instance(): Promise<{
    renderString(source: string, options: { format: 'svg' }): string;
  }>;
}

interface Resvg {
  Resvg: new (
    svg: string,
    options: {
      fitTo: { mode: 'zoom'; value: number };
      font: { loadSystemFonts: boolean };
    },
  ) => { render(): { asPng(): Uint8Array } };
}

/** A CommonJS peer imported from ESM may put its exports on `default`. */
function unwrap<T extends object>(module: T | { default: T }, key: string): T {
  return key in module ? (module as T) : (module as { default: T }).default;
}

async function peer<T extends object>(
  load: typeof importPeer,
  name: string,
  key: string,
  format: Format,
  fromFile: string,
): Promise<T> {
  const module = await load<T | { default: T }>(name, fromFile);
  if (module === null)
    throw new CliError(
      3,
      `--format ${format} needs ${name}.`,
      `Install it: npm i -D ${name}`,
    );
  return unwrap(module, key);
}

async function svgOf(
  dot: string,
  format: Format,
  fromFile: string,
  load: typeof importPeer,
): Promise<string> {
  const viz = await peer<Viz>(
    load,
    '@viz-js/viz',
    'instance',
    format,
    fromFile,
  );
  return (await viz.instance()).renderString(dot, { format: 'svg' });
}

/** The output bytes or text for `format`. SVG and PNG load their optional peers here. */
export async function render(
  graph: NexusGraph,
  format: Format,
  view: View,
  devtools: DevtoolsApi,
  fromFile: string,
  load: typeof importPeer = importPeer,
): Promise<string | Uint8Array> {
  switch (format) {
    case 'json':
      return `${JSON.stringify(graph, null, 2)}\n`;
    case 'mermaid':
      return devtools.toMermaid(graph, { view });
    case 'dot':
      return devtools.toDot(graph, { view });
    case 'svg':
      return svgOf(devtools.toDot(graph, { view }), format, fromFile, load);
    case 'png': {
      const svg = await svgOf(
        devtools.toDot(graph, { view }),
        format,
        fromFile,
        load,
      );
      const { Resvg } = await peer<Resvg>(
        load,
        '@resvg/resvg-js',
        'Resvg',
        format,
        fromFile,
      );
      return new Resvg(svg, {
        fitTo: { mode: 'zoom', value: 2 },
        font: { loadSystemFonts: true },
      })
        .render()
        .asPng();
    }
  }
}
