import { describe, expect, it } from 'vitest';

import type { NexusGraph } from '@nexusdi/devtools';

import type { DevtoolsApi } from './devtools.js';
import { render } from './render.js';

const GRAPH: NexusGraph = { modules: [], providers: [], edges: [] };
const DEVTOOLS = {
  inspect: () => GRAPH,
  toDot: (_graph: NexusGraph, options?: { view?: string }) =>
    `dot:${options?.view}`,
  toMermaid: (_graph: NexusGraph, options?: { view?: string }) =>
    `mermaid:${options?.view}`,
} as unknown as DevtoolsApi;
const none = async () => null;

describe('render', () => {
  it('writes json with a trailing newline', async () => {
    expect(
      await render(GRAPH, 'json', 'providers', DEVTOOLS, '/p/a.ts', none),
    ).toBe(`${JSON.stringify(GRAPH, null, 2)}\n`);
  });

  it('passes the view to the text renderers', async () => {
    expect(
      await render(GRAPH, 'dot', 'modules', DEVTOOLS, '/p/a.ts', none),
    ).toBe('dot:modules');
    expect(
      await render(GRAPH, 'mermaid', 'providers', DEVTOOLS, '/p/a.ts', none),
    ).toBe('mermaid:providers');
  });

  it('exits 3 with the install line when @viz-js/viz is missing', async () => {
    await expect(
      render(GRAPH, 'svg', 'providers', DEVTOOLS, '/p/a.ts', none),
    ).rejects.toMatchObject({
      exitCode: 3,
      message: '--format svg needs @viz-js/viz.',
      fix: 'Install it: npm i -D @viz-js/viz',
    });
  });

  it('exits 3 with the install line when @resvg/resvg-js is missing for png', async () => {
    const vizOnly = async (name: string) =>
      name === '@viz-js/viz'
        ? { instance: async () => ({ renderString: () => '<svg/>' }) }
        : null;
    await expect(
      render(GRAPH, 'png', 'providers', DEVTOOLS, '/p/a.ts', vizOnly as never),
    ).rejects.toMatchObject({
      exitCode: 3,
      message: '--format png needs @resvg/resvg-js.',
    });
  });

  it('renders svg from the dot text through viz', async () => {
    const seen: string[] = [];
    const viz = async () => ({
      instance: async () => ({
        renderString: (dot: string, options: { format: string }) => {
          seen.push(`${options.format}:${dot}`);
          return '<svg/>';
        },
      }),
    });
    expect(
      await render(GRAPH, 'svg', 'modules', DEVTOOLS, '/p/a.ts', viz as never),
    ).toBe('<svg/>');
    expect(seen).toEqual(['svg:dot:modules']);
  });

  it('reads a peer whose functions sit on the default export', async () => {
    const viz = async () => ({
      default: { instance: async () => ({ renderString: () => '<svg/>' }) },
    });
    expect(
      await render(
        GRAPH,
        'svg',
        'providers',
        DEVTOOLS,
        '/p/a.ts',
        viz as never,
      ),
    ).toBe('<svg/>');
  });
});
