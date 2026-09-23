import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  layerViolations,
  nodeViolations,
  type SourceFileText,
} from './core-layers.js';

const SRC = join(workspaceRoot, 'libs', 'core', 'src');
const TEST = /\.(test|spec|test-d|browser\.test)\.ts$/;

function sources(): SourceFileText[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory())
        return entry.name === 'regressions' ? [] : walk(path);
      return entry.name.endsWith('.ts') && !TEST.test(entry.name) ? [path] : [];
    });
  return walk(SRC).map((path) => ({
    path: relative(SRC, path).split('\\').join('/'),
    source: readFileSync(path, 'utf8'),
  }));
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

  it('allows testing/ to import the public and the internal entry only', () => {
    expect(
      layerViolations([
        {
          path: 'testing/index.ts',
          source:
            "import { Nexus } from '../index.js';\nimport { createContainer } from '../internal.js';",
        },
        {
          path: 'testing/other.ts',
          source: "import { compile } from '../blueprint/compile.js';",
        },
      ]),
    ).toEqual([
      'testing/other.ts imports blueprint/compile.ts, and testing/ may import only testing/, index.ts, internal.ts',
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

  it('allows internal.ts to be imported from testing/ and from nowhere else', () => {
    expect(
      layerViolations([
        { path: 'index.ts', source: "export * from './internal.js';" },
        { path: 'runtime/x.ts', source: "import { a } from '../internal.js';" },
        {
          path: 'testing/index.ts',
          source: "import { a } from '../internal.js';",
        },
      ]),
    ).toEqual([
      'index.ts imports internal.ts, which only testing/ may import',
      'runtime/x.ts imports internal.ts, and runtime/ may import only runtime/, blueprint/, definitions/, errors/, polyfill/symbol-dispose.ts',
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

  it('accepts node: inside node/', () => {
    expect(
      nodeViolations([
        {
          path: 'node/index.ts',
          source: "import { AsyncLocalStorage } from 'node:async_hooks';",
        },
      ]),
    ).toEqual([]);
  });

  it('accepts globalThis.process inside node/', () => {
    expect(
      nodeViolations([
        {
          path: 'node/index.ts',
          source: 'const debug = globalThis.process.env.DEBUG;',
        },
      ]),
    ).toEqual([]);
  });

  it('holds for the current libs/core source', () => {
    expect(nodeViolations(sources())).toEqual([]);
  });
});
