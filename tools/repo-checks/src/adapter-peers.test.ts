import { workspaceRoot } from '@nx/devkit';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf-8');
const legs = JSON.parse(read('scripts/adapter-peers.json')) as Record<
  string,
  {
    install?: string[];
    families?: { packages: string[]; version: string }[];
    targets: string[];
    env?: Record<string, string>;
    browsers?: boolean;
    peerExceptions?: Record<string, Record<string, string>>;
  }
>;
const { installSpecs, legProblems } = (await import(
  join(workspaceRoot, 'scripts/adapter-peers-check.mjs')
)) as {
  legProblems: (
    root: string,
    specs: string[],
    libs: string[],
    exceptions?: Record<string, Record<string, string>>,
  ) => string[];
  installSpecs: (
    leg: unknown,
    published: (spec: string) => string[],
  ) => string[];
};
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
    // The stub admits exactly the range the family names, so a floor leg
    // that names a caret range fails to resolve.
    const specs = installSpecs(legs[leg], (spec) => [
      spec.slice(spec.lastIndexOf('@') + 1),
    ]);
    expect(specs).toContain(`${peer}@${peerFloor(dir, peer)}`);
  });

  it('keeps every @react-router/* package the workspace declares in the family of each react-router leg', () => {
    const manifests = [
      'package.json',
      ...['libs', 'examples', 'apps']
        .flatMap((d) =>
          readdirSync(join(workspaceRoot, d)).map((n) => `${d}/${n}`),
        )
        .map((d) => `${d}/package.json`),
    ];
    const used = new Set<string>(['react-router']);
    for (const path of manifests) {
      let pkg: Record<string, Record<string, string> | undefined>;
      try {
        pkg = JSON.parse(read(path));
      } catch {
        continue;
      }
      for (const field of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
      ])
        for (const name of Object.keys(pkg[field] ?? {}))
          if (name.startsWith('@react-router/')) used.add(name);
    }
    for (const leg of Object.keys(legs).filter((n) =>
      n.startsWith('react-router-'),
    )) {
      const families = legs[leg]?.families ?? [];
      expect(families).toHaveLength(1);
      const members = new Set(families[0]?.packages);
      expect(
        [...used].filter((n) => !members.has(n)),
        leg,
      ).toEqual([]);
      expect(legs[leg]?.install ?? [], leg).toEqual([]);
    }
  });

  it('refuses an empty family, an empty intersection and a failed npm view', () => {
    expect(() =>
      installSpecs({ families: [{ packages: [], version: '^8' }] }, () => []),
    ).toThrow(/at least one package/);
    expect(() =>
      installSpecs(
        { families: [{ packages: ['a', 'b'], version: '^8' }] },
        (spec) => (spec.startsWith('a@') ? ['8.5.0'] : ['8.4.0']),
      ),
    ).toThrow(/family a, b at \^8: no version satisfies/);
    expect(() =>
      installSpecs({ families: [{ packages: ['a'], version: '^8' }] }, () => {
        throw new Error('E404');
      }),
    ).toThrow(/family a at \^8: npm view a@\^8 failed/);
  });

  it('checks the peers of an installed package against the root copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'peers-'));
    const put = (name: string, manifest: object) => {
      mkdirSync(join(root, 'node_modules', name), { recursive: true });
      writeFileSync(
        join(root, 'node_modules', name, 'package.json'),
        JSON.stringify({ name, ...manifest }),
      );
    };
    const lib = join(root, 'lib');
    mkdirSync(lib);
    writeFileSync(join(lib, 'package.json'), JSON.stringify({ name: 'lib' }));
    put('core', {
      version: '8.5.0',
      peerDependencies: { base: '^8.5.0', extra: '^1' },
      peerDependenciesMeta: { extra: { optional: true } },
    });
    put('base', { version: '8.4.0' });
    put('extra', { version: '2.0.0' });
    expect(legProblems(root, ['core@8.5.0'], [lib])).toEqual([
      'core 8.5.0 needs base ^8.5.0, the root has 8.4.0',
    ]);
    expect(
      legProblems(root, ['core@8.5.0'], [lib], { core: { base: 'why' } }),
    ).toEqual([]);
    put('base', { version: '8.5.0' });
    expect(
      legProblems(root, ['core@8.5.0'], [lib], { core: { base: 'why' } }),
    ).toEqual([
      "core 8.5.0 peer base ^8.5.0 is met by the root's 8.5.0, drop the exception",
    ]);
    const stale = legProblems(root, ['core@8.5.0'], [lib], {
      core: { extra: 'why', missing: 'why' },
      other: { base: 'why' },
    });
    expect(stale).toEqual([
      'peer exception for other, which the leg does not install',
      'peer exception core > extra, which core 8.5.0 does not declare as a required peer',
      'peer exception core > missing, which core 8.5.0 does not declare as a required peer',
    ]);
    expect(legProblems(root, ['core@8.5.0'], [lib])).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it('gives every peer exception a reason', () => {
    for (const [name, leg] of Object.entries(legs))
      for (const [pkg, peers] of Object.entries(leg.peerExceptions ?? {}))
        for (const [peer, reason] of Object.entries(peers))
          expect(
            reason.trim().length,
            `${name}: ${pkg} > ${peer}`,
          ).toBeGreaterThan(0);
  });

  it('installs a family at the highest version every member has published', () => {
    const published: Record<string, string[]> = {
      a: ['8.4.0', '8.5.0'],
      b: ['8.4.0', '8.5.0'],
      c: ['8.4.0'],
    };
    const view = (spec: string) => published[spec.split('@')[0] ?? ''] ?? [];
    expect(
      installSpecs(
        {
          install: ['x@1'],
          families: [{ packages: ['a', 'b'], version: '^8' }],
        },
        view,
      ),
    ).toEqual(['x@1', 'a@8.5.0', 'b@8.5.0']);
    expect(
      installSpecs(
        { families: [{ packages: ['a', 'b', 'c'], version: '^8' }] },
        view,
      ),
    ).toEqual(['a@8.4.0', 'b@8.4.0', 'c@8.4.0']);
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
