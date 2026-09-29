import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  importsOf,
  layerViolations,
  nodeViolations,
  parseFile,
  type SourceFileText,
} from './core-layers.js';
import { libDirs, sourcesOf } from './entry-graph.js';

const LIBS = join(workspaceRoot, 'libs');
const SRC = join(LIBS, 'core', 'src');

/** Every package's sources under libs/, with `path` relative to libs/. */
function everyPackageSources(): SourceFileText[] {
  return libDirs(LIBS).flatMap((dir) =>
    sourcesOf(join(LIBS, dir, 'src'), LIBS),
  );
}

describe('importsOf', () => {
  it('reads every way a file names a module, marking the type-only ones', () => {
    expect(
      importsOf(
        parseFile({
          path: 'x.ts',
          source: [
            "import { a } from './a.js';",
            "import type { B } from '@acme/b';",
            "export { c } from './c.js';",
            "const d = import('@acme/d');",
            "type E = typeof import('@acme/e');",
            "declare module '@acme/f' {}",
          ].join('\n'),
        }),
      ),
    ).toEqual([
      { specifier: './a.js', typeOnly: false },
      { specifier: '@acme/b', typeOnly: true },
      { specifier: './c.js', typeOnly: false },
      { specifier: '@acme/d', typeOnly: false },
      { specifier: '@acme/e', typeOnly: true },
      { specifier: '@acme/f', typeOnly: true },
    ]);
  });
});

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

  it('accepts text/ importing errors/ and types from blueprint/views.ts and definitions/', () => {
    expect(
      layerViolations([
        {
          path: 'text/core-text.ts',
          source: [
            "import { describeThrown } from '../errors/describe-thrown.js';",
            "import type { ErrorTextPack } from '../blueprint/views.js';",
            "import { type Class } from '../definitions/types.js';",
            "export { coreText } from './core-text.js';",
          ].join('\n'),
        },
      ]),
    ).toEqual([]);
  });

  it('reports a value import from blueprint/views.ts or definitions/ in text/', () => {
    expect(
      layerViolations([
        {
          path: 'text/core-text.ts',
          source: [
            "import { type ErrorTextPack, bindView } from '../blueprint/views.js';",
            "import { Token } from '../definitions/token.js';",
          ].join('\n'),
        },
      ]),
    ).toEqual([
      'text/core-text.ts imports values from blueprint/views.ts, and text/ may import only types from blueprint/views.ts, definitions/',
      'text/core-text.ts imports values from definitions/token.ts, and text/ may import only types from blueprint/views.ts, definitions/',
    ]);
  });

  it('reports text/ importing another part of blueprint/', () => {
    expect(
      layerViolations([
        {
          path: 'text/core-text.ts',
          source: "import type { Blueprint } from '../blueprint/blueprint.js';",
        },
      ]),
    ).toEqual([
      'text/core-text.ts imports blueprint/blueprint.ts, and text/ may import only text/, errors/, blueprint/views.ts, definitions/',
    ]);
  });

  it('reports a runtime file that imports text/', () => {
    expect(
      layerViolations([
        {
          path: 'runtime/x.ts',
          source: "import { coreText } from '../text/index.js';",
        },
      ]),
    ).toEqual([
      'runtime/x.ts imports text/index.ts, and runtime/ may import only runtime/, blueprint/, definitions/, errors/, polyfill/symbol-dispose.ts',
    ]);
  });

  it('reports a root file that imports text/', () => {
    expect(
      layerViolations([
        {
          path: 'index.ts',
          source: "export { coreText } from './text/index.js';",
        },
      ]),
    ).toEqual([
      'index.ts imports text/index.ts, and the main entry may not reach text/',
    ]);
  });

  it('reports a root file that imports the text/ folder by its name', () => {
    expect(
      layerViolations([
        { path: 'index.ts', source: "export * from './text';" },
        { path: 'text/index.ts', source: "export * from './core-text.js';" },
        { path: 'text/core-text.ts', source: 'export const coreText = {};' },
      ]),
    ).toEqual([
      'index.ts imports text/index.ts, and the main entry may not reach text/',
    ]);
  });

  it('holds for the current libs/core source', () => {
    expect(layerViolations(sourcesOf(SRC))).toEqual([]);
  });
});

describe('nodeViolations', () => {
  it('lets cli/ use node: modules and process', () => {
    expect(
      nodeViolations([
        {
          path: 'cli/src/main.ts',
          source:
            "import { parseArgs } from 'node:util';\nconst argv = process.argv;",
        },
      ]),
    ).toEqual([]);
  });

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
