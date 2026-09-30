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

/**
 * Imports the optional peers `format` needs. When any is missing, or
 * resolves but throws on import (its platform binary left out by
 * --omit=optional), throws one CliError 3 that names every such peer and
 * gives one install line for all of them.
 */
async function peers(
  load: typeof importPeer,
  names: readonly string[],
  format: Format,
  fromFile: string,
): Promise<object[]> {
  const settled = await Promise.allSettled(
    names.map((name) => load<object>(name, fromFile)),
  );
  const modules: object[] = [];
  const failed: string[] = [];
  const problems: string[] = [];
  let broken = false;
  for (const [i, result] of settled.entries()) {
    const name = names[i] as string;
    if (result.status === 'rejected') {
      broken = true;
      failed.push(name);
      problems.push(
        `${name}, which is installed but failed to load (${
          (result.reason as Error).message
        })`,
      );
    } else if (result.value === null) {
      failed.push(name);
      problems.push(name);
    } else modules.push(result.value);
  }
  if (failed.length > 0)
    throw new CliError(
      3,
      `--format ${format} needs ${problems.join(' and ')}.`,
      `${broken ? 'Reinstall' : 'Install'} ${
        failed.length === 1 ? 'it' : 'them'
      }: npm i -D ${failed.join(' ')}`,
    );
  return modules;
}

async function svgOf(dot: string, viz: Viz): Promise<string> {
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
    case 'svg': {
      const [viz] = await peers(load, ['@viz-js/viz'], format, fromFile);
      return svgOf(
        devtools.toDot(graph, { view }),
        unwrap(viz as Viz | { default: Viz }, 'instance'),
      );
    }
    case 'png': {
      const [viz, resvg] = await peers(
        load,
        ['@viz-js/viz', '@resvg/resvg-js'],
        format,
        fromFile,
      );
      const svg = await svgOf(
        devtools.toDot(graph, { view }),
        unwrap(viz as Viz | { default: Viz }, 'instance'),
      );
      const { Resvg } = unwrap(resvg as Resvg | { default: Resvg }, 'Resvg');
      return new Resvg(svg, {
        fitTo: { mode: 'zoom', value: 2 },
        font: { loadSystemFonts: true },
      })
        .render()
        .asPng();
    }
  }
}
