import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';

import { classifyScale } from '../../outcome.ts';
import { SHAPES } from '../config.ts';
import { expectedDigest, type ScaleGraph } from '../graph.ts';
import { graphOf } from '../shapes.ts';
import { six } from '../six.ts';
import { renderNexusdi } from './nexusdi.ts';

// Under benchmarks/, so the bundles resolve @nexusdi/core through the
// workspace's node_modules.
const TMP = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'tmp',
  'render-nexusdi',
);
const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const CHILD = join(import.meta.dirname, '..', 'verify-child.mjs');

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function writeApp(name: string, graph: ScaleGraph): string {
  const dir = join(TMP, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const [file, text] of Object.entries(renderNexusdi(graph)))
    writeFileSync(join(dir, 'src', file), text);
  writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph));
  return dir;
}

/**
 * tsc --noEmit with strict options and the workspace core's source
 * (customConditions), so a render error shows up without a build of core.
 * cells.test.ts runs the same shapes through the real profile and tsc
 * build. Returns the diagnostics, empty when the app type-checks.
 */
function typecheck(dir: string): string {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        lib: ['es2022', 'esnext.disposable', 'dom'],
        types: [],
        skipLibCheck: true,
        noEmit: true,
        verbatimModuleSyntax: true,
        allowImportingTsExtensions: true,
        customConditions: ['@nexusdi/source'],
      },
      include: ['src/*.ts'],
    }),
  );
  try {
    execFileSync(
      process.execPath,
      [
        join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
        '-p',
        join(dir, 'tsconfig.json'),
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return '';
  } catch (error) {
    return String((error as { stdout?: string }).stdout);
  }
}

async function bundle(
  dir: string,
  plugins: Parameters<typeof build>[0]['plugins'] = [],
): Promise<string> {
  const outfile = join(dir, 'bundle.mjs');
  await build({
    entryPoints: [join(dir, 'src', 'app.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    outfile,
    logLevel: 'silent',
    plugins,
  });
  return outfile;
}

describe('renderNexusdi', () => {
  const files = renderNexusdi(six());

  it('renders app.ts for the six-provider graph', () => {
    expect(files['app.ts']).toMatchInlineSnapshot(`
      "// Scale app: mixed at 6 providers, NexusDI plain.
      // Docs: https://github.com/NexusDI/core#readme
      // (Interfaces and tokens, Providers, Modules), read 2026-09-30. An async
      // factory is \`useFactory: async\`, which Nexus.create awaits.
      // Departures: none.
      import { Nexus, Token, defineModule, type LookupOptions } from '@nexusdi/core';

      import { built } from './counter.ts';
      import { M0 } from './m0.ts';
      import { M1 } from './m1.ts';
      import {
        TP0,
        TP1,
        TP2,
        TP3,
        TP4,
        TP5,
      } from './tokens.ts';

      const App = defineModule({
        name: 'App',
        imports: [M1],
      });

      const T: readonly Token<unknown>[] = [
        TP0 as Token<unknown>,
        TP1 as Token<unknown>,
        TP2 as Token<unknown>,
        TP3 as Token<unknown>,
        TP4 as Token<unknown>,
        TP5 as Token<unknown>,
      ];

      // The root sees the exports of the modules it imports. Every other
      // provider is looked up inside its own module (LookupOptions.module).
      const L: readonly (LookupOptions | undefined)[] = [
        { module: M0 },
        { module: M0 },
        { module: M0 },
        { module: M1 },
        undefined,
        undefined,
      ];

      export const scale = {
        count: 6,
        entries: [4, 5],
        target: 4,
        packages: ['@nexusdi/core'],
        built,
        create: (): Promise<Nexus> => Nexus.create(App),
        get: (handle: Nexus, index: number): unknown =>
          handle.get(T[index], L[index]),
      };
      "
    `);
  });

  it('renders one file per module of a two-module graph', () => {
    expect(Object.keys(files).sort()).toEqual([
      'app.ts',
      'counter.ts',
      'm0.ts',
      'm1.ts',
      'tokens.ts',
    ]);
    expect(files['m0.ts']).toMatchInlineSnapshot(`
      "import { defineModule, provide } from '@nexusdi/core';

      import { __scaleBuilt } from './counter.ts';
      import {
        TP0,
        type IP0,
        TP1,
        type IP1,
        TP2,
        type IP2,
      } from './tokens.ts';

      export class P1 implements IP1 {
        static deps = [TP0] as const;
        readonly id = 'p1';
        readonly d0: IP0;
        constructor(d0: IP0) {
          this.d0 = d0;
          __scaleBuilt(1, 'class');
        }
      }

      export class P2 implements IP2 {
        readonly id = 'p2';
        readonly d0: IP0;
        readonly d1: IP1;
        constructor(d0: IP0, d1: IP1) {
          this.d0 = d0;
          this.d1 = d1;
        }
      }

      export const M0 = defineModule({
        name: 'm0',
        providers: [
          provide(TP0, { useValue: { id: 'p0' } }),
          provide(TP1, { useClass: P1, lifetime: 'singleton' }),
          provide(TP2, {
            useFactory: (d0: IP0, d1: IP1): IP2 => {
              const made = new P2(d0, d1);
              __scaleBuilt(2, 'factory');
              return made;
            },
            deps: [TP0, TP1],
          }),
        ],
        exports: [TP1, TP2],
      });
      "
    `);
    expect(files['m1.ts']).toMatchInlineSnapshot(`
      "import { defineModule, provide } from '@nexusdi/core';

      import { __scaleBuilt } from './counter.ts';
      import { M0 } from './m0.ts';
      import {
        TP1,
        type IP1,
        TP2,
        type IP2,
        TP3,
        type IP3,
        TP4,
        type IP4,
        TP5,
        type IP5,
      } from './tokens.ts';

      export class P3 implements IP3 {
        static deps = [TP1] as const;
        readonly id = 'p3';
        readonly d0: IP1;
        constructor(d0: IP1) {
          this.d0 = d0;
          __scaleBuilt(3, 'class');
        }
      }

      export class P4 implements IP4 {
        static deps = [TP2, TP3] as const;
        readonly id = 'p4';
        readonly d0: IP2;
        readonly d1: IP3;
        constructor(d0: IP2, d1: IP3) {
          this.d0 = d0;
          this.d1 = d1;
          __scaleBuilt(4, 'class');
        }
      }

      export class P5 implements IP5 {
        static deps = [TP3] as const;
        readonly id = 'p5';
        readonly d0: IP3;
        constructor(d0: IP3) {
          this.d0 = d0;
          __scaleBuilt(5, 'class');
        }
      }

      export const M1 = defineModule({
        name: 'm1',
        imports: [M0],
        providers: [
          provide(TP3, { useClass: P3, lifetime: 'singleton' }),
          provide(TP4, { useClass: P4, lifetime: 'singleton' }),
          provide(TP5, { useClass: P5, lifetime: 'singleton' }),
        ],
        exports: [TP4, TP5],
      });
      "
    `);
    expect(files['tokens.ts']).toMatchInlineSnapshot(`
      "import { Token } from '@nexusdi/core';

      export interface IP0 {
        readonly id: 'p0';
      }
      export const TP0 = new Token<IP0>('p0');
      export interface IP1 {
        readonly id: 'p1';
      }
      export const TP1 = new Token<IP1>('p1');
      export interface IP2 {
        readonly id: 'p2';
      }
      export const TP2 = new Token<IP2>('p2');
      export interface IP3 {
        readonly id: 'p3';
      }
      export const TP3 = new Token<IP3>('p3');
      export interface IP4 {
        readonly id: 'p4';
      }
      export const TP4 = new Token<IP4>('p4');
      export interface IP5 {
        readonly id: 'p5';
      }
      export const TP5 = new Token<IP5>('p5');
      "
    `);
    expect(files['counter.ts']).toMatchInlineSnapshot(`
      "const counts = new Uint32Array(6);
      const kinds: (string | undefined)[] = new Array<string | undefined>(6);

      /** Constructions per provider index, and the kind each one reported. */
      export const built = { counts, kinds };

      export function __scaleBuilt(index: number, kind: string): void {
        counts[index]++;
        kinds[index] = kind;
      }
      "
    `);
  });

  it('renders an async factory that awaits before it constructs', () => {
    const graph = six();
    graph.providers[2].kind = 'async-factory';
    expect(renderNexusdi(graph)['m0.ts']).toContain(`    provide(TP2, {
      useFactory: async (d0: IP0, d1: IP1): Promise<IP2> => {
        await Promise.resolve();
        const made = new P2(d0, d1);
        __scaleBuilt(2, 'async-factory');
        return made;
      },
      deps: [TP0, TP1],
    }),`);
  });

  it('renders one class per file for wide and deep', () => {
    for (const shape of ['wide', 'deep'] as const) {
      const names = Object.keys(renderNexusdi(graphOf(shape, 50)));
      expect(names).toHaveLength(53);
      expect(names).toContain('p49.ts');
    }
  });

  it('passes { module } to get for non-entries only', async () => {
    const graph = graphOf('mixed', 50);
    const dir = writeApp('lookup', graph);
    // A stand-in core that records each get's options, so the test reads
    // the adapter's calls without the real lookup rules.
    const file = await bundle(dir, [
      {
        name: 'stub-core',
        setup(b) {
          b.onResolve({ filter: /^@nexusdi\/core$/ }, () => ({
            path: 'core',
            namespace: 'stub',
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: `
              export class Token { constructor(name) { this.name = name; } }
              export const provide = (token, def) => ({ token, ...def });
              export const defineModule = (def) => def;
              export const Nexus = {
                create: async () => ({ get: (token, options) => options }),
              };`,
            loader: 'js',
          }));
        },
      },
    ]);
    const { scale } = (await import(file)) as {
      scale: {
        create(): Promise<unknown>;
        get(h: unknown, i: number): { module?: { name: string } } | undefined;
      };
    };
    const handle = await scale.create();
    const entries = new Set(graph.entries);
    expect(entries.size).toBeLessThan(graph.size);
    for (const p of graph.providers) {
      const options = scale.get(handle, p.index);
      if (entries.has(p.index)) expect(options).toBeUndefined();
      else expect(options?.module?.name).toBe(graph.modules[p.module].name);
    }
  });

  for (const shape of SHAPES)
    it(`type-checks and passes verify-child for ${shape} at n = 50`, async () => {
      const graph = graphOf(shape, 50);
      const dir = writeApp(shape, graph);
      expect(typecheck(dir)).toBe('');
      const printed = JSON.parse(
        execFileSync(
          process.execPath,
          [CHILD, await bundle(dir), join(dir, 'graph.json')],
          { encoding: 'utf8' },
        ),
      ) as Record<string, unknown>;
      expect(classifyScale(printed, null, expectedDigest(graph))).toEqual({
        outcome: 'pass',
      });
    }, 120_000);
});
