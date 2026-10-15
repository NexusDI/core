import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf-8');
const legs = JSON.parse(read('scripts/adapter-peers.json')) as Record<
  string,
  {
    install: string[];
    targets: string[];
    env?: Record<string, string>;
    browsers?: boolean;
  }
>;
const ci = parse(read('.github/workflows/ci.yml')) as {
  jobs: Record<
    string,
    { strategy?: { matrix?: { leg?: string[] } }; steps: { run?: string }[] }
  >;
};

/** The floor of each peer range, as the adapter's package.json states it. */
function peerFloor(dir: string, peer: string): string {
  const pkg = JSON.parse(read(`libs/${dir}/package.json`)) as {
    peerDependencies: Record<string, string>;
  };
  const range = pkg.peerDependencies[peer];
  const floor = /\^(\d+\.\d+\.\d+)/.exec(range ?? '')?.[1];
  if (!floor) throw new Error(`libs/${dir} has no caret ${peer} peer`);
  return floor;
}

describe('adapter-peers', () => {
  it('runs every leg of scripts/adapter-peers.json in the workflow matrix', () => {
    expect(ci.jobs['adapter-peers']?.strategy?.matrix?.leg).toEqual(
      Object.keys(legs),
    );
    const runs = (ci.jobs['adapter-peers']?.steps ?? [])
      .map((s) => s.run ?? '')
      .join('\n');
    expect(runs).toContain('node scripts/adapter-peers.mjs "$LEG"');
    expect(runs).not.toContain('nx run-many');
  });

  it.each([
    ['hono', 'hono', 'hono-floor'],
    ['express', 'express', 'express-floor'],
    ['fastify', 'fastify', 'fastify-floor'],
    ['react-router', 'react-router', 'react-router-7-floor'],
    ['react', 'react', 'react-floor'],
    ['vitest', 'vitest', 'vitest-floor'],
  ])("tests the floor of the %s adapter's %s peer", (dir, peer, leg) => {
    expect(legs[leg]?.install).toContain(`${peer}@${peerFloor(dir, peer)}`);
  });

  it('runs the react-router 7 legs with the v8 middleware switch', () => {
    for (const leg of ['react-router-7-floor', 'react-router-7-latest'])
      expect(legs[leg]?.env).toEqual({ REACT_ROUTER_V8_MIDDLEWARE: '1' });
  });

  it('installs Chromium for the react legs, and runs no React Router 8 e2e on react 19.0', () => {
    expect(legs['react-floor']?.browsers).toBe(true);
    expect(legs['react-19-latest']?.browsers).toBe(true);
    // React Router 8.4 needs react 19.2.7, so the floor runs the HMR suite alone.
    expect(legs['react-floor']?.targets).toEqual([
      '@nexusdi/react:test',
      '@nexusdi/react:e2e-hmr',
    ]);
    expect(legs['react-19-latest']?.targets).toEqual([
      '@nexusdi/react:test',
      '@nexusdi/react:e2e',
    ]);
  });
});
