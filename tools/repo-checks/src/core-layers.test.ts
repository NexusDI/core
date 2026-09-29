import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  layerViolations,
  nodeViolations,
  type SourceFileText,
} from './core-layers.js';

const LIBS = join(workspaceRoot, 'libs');
const SRC = join(LIBS, 'core', 'src');
const TEST = /\.(test|spec|test-d|browser\.test)\.ts$/;

/** Every non-test `.ts` file under `dir`, with `path` relative to `root`. */
function sourcesUnder(dir: string, root: string): SourceFileText[] {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
      const path = join(d, entry.name);
      if (entry.isDirectory())
        return entry.name === 'regressions' ? [] : walk(path);
      return entry.name.endsWith('.ts') && !TEST.test(entry.name) ? [path] : [];
    });
  return walk(dir).map((path) => ({
    path: relative(root, path).split('\\').join('/'),
    source: readFileSync(path, 'utf8'),
  }));
}

function sources(): SourceFileText[] {
  return sourcesUnder(SRC, SRC);
}

/** Every package's sources under libs/, with `path` relative to libs/. */
function everyPackageSources(): SourceFileText[] {
  return readdirSync(LIBS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const src = join(LIBS, entry.name, 'src');
      return existsSync(src) ? sourcesUnder(src, LIBS) : [];
    });
}

describe('layerViolations', () => {
  it('accepts an import into a lower layer', () => {
    expect(
      layerViolations([
        {
          path: 'blueprint/walk.ts',
          source: "import { Token } from '../definitions/token.js';",
        },
      ]),
    ).toEqual([]);
  });

  it('reports an import into a higher layer', () => {
    expect(
      layerViolations([
        {
          path: 'definitions/token.ts',
          source: "import { compile } from '../blueprint/compile.js';",
        },
      ]),
    ).toEqual([
      'definitions/token.ts imports blueprint/compile.ts, and definitions/ may import only definitions/, errors/',
    ]);
  });

  it('reports the metadata polyfill imported outside decorators', () => {
    expect(
      layerViolations([
        {
          path: 'runtime/nexus.ts',
          source: "import '../polyfill/symbol-metadata.js';",
        },
      ]),
    ).toHaveLength(1);
  });

  it('reports the metadata polyfill imported from a root file', () => {
    expect(
      layerViolations([
        {
          path: 'index.ts',
          source: "import './polyfill/symbol-metadata.js';",
        },
      ]),
    ).toEqual([
      'index.ts imports polyfill/symbol-metadata.ts, which only decorators/ may import',
    ]);
  });

  it('reads re-exports and type-only imports as imports', () => {
    expect(
      layerViolations([
        {
          path: 'errors/index.ts',
          source: "export type { Token } from '../definitions/token.js';",
        },
      ]),
    ).toHaveLength(1);
  });

  it('reports a testing/ folder, which @nexusdi/testing now holds', () => {
    expect(
      layerViolations([
        {
          path: 'testing/index.ts',
          source: "import { Nexus } from '../index.js';",
        },
      ]),
    ).toEqual([
      'testing/index.ts sits in testing/, which is not a known layer',
    ]);
  });

  it('holds for the current libs/core source', () => {
    expect(layerViolations(sources())).toEqual([]);
  });
});

describe('nodeViolations', () => {
  it('reports a node: specifier outside node/', () => {
    expect(
      nodeViolations([
        { path: 'runtime/x.ts', source: "import { x } from 'node:util';" },
      ]),
    ).toEqual(["runtime/x.ts references 'node:util'; only node/ may"]);
  });

  it('reports a process reference outside node/', () => {
    expect(
      nodeViolations([
        { path: 'decorators/x.ts', source: 'const debug = process.env.DEBUG;' },
      ]),
    ).toEqual(['decorators/x.ts references process; only node/ may']);
  });

  it('reports a globalThis.process reference outside node/', () => {
    expect(
      nodeViolations([
        {
          path: 'decorators/x.ts',
          source: 'const debug = globalThis.process.env.DEBUG;',
        },
      ]),
    ).toEqual(['decorators/x.ts references process; only node/ may']);
  });

  it('ignores a property named process', () => {
    expect(
      nodeViolations([
        {
          path: 'runtime/x.ts',
          source: 'const a = { process: 1 }; a.process;',
        },
      ]),
    ).toEqual([]);
  });

  it('accepts node: inside node/src/', () => {
    expect(
      nodeViolations([
        {
          path: 'node/src/index.ts',
          source: "import { AsyncLocalStorage } from 'node:async_hooks';",
        },
      ]),
    ).toEqual([]);
  });

  it('accepts globalThis.process inside node/src/', () => {
    expect(
      nodeViolations([
        {
          path: 'node/src/index.ts',
          source: 'const debug = globalThis.process.env.DEBUG;',
        },
      ]),
    ).toEqual([]);
  });

  it('holds for the current workspace source', () => {
    expect(nodeViolations(everyPackageSources())).toEqual([]);
  });
});
