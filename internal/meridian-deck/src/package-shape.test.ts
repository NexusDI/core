import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as {
  name: string;
  private?: boolean;
  sideEffects?: unknown;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
  exports: Record<string, Record<string, string> | string>;
};

/** Every source file of a folder and its subfolders, tests and their support files left out. */
function sources(folder: string): { file: string; text: string }[] {
  const dir = join(import.meta.dirname, folder);
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(
      (name) =>
        name.endsWith('.ts') &&
        !name.endsWith('.test.ts') &&
        !name.endsWith('test-support.ts'),
    )
    .map((name) => ({
      file: `${folder}/${name}`,
      text: readFileSync(join(dir, name), 'utf8'),
    }));
}

/** One import or export statement that names a module. */
interface Statement {
  readonly specifier: string;
  /** True for `import type` and `export type`. An inline `{ type X }` counts as run-time. */
  readonly typeOnly: boolean;
}

/** Reads the statements of a source with the TypeScript parser, so a multi-line list is one statement. */
function statementsOf(text: string): Statement[] {
  const file = ts.createSourceFile(
    'source.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: Statement[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(node)
        ? (node.importClause?.isTypeOnly ?? false)
        : node.isTypeOnly;
      found.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const SYSTEMS = '@nexusdi/meridian-systems';

/** The statements of a folder that name the package, with the file each sits in. */
function namingSystems(folder: string) {
  return sources(folder).flatMap(({ file, text }) =>
    statementsOf(text)
      .filter(({ specifier }) => specifier.startsWith(SYSTEMS))
      .map((statement) => ({ file, ...statement })),
  );
}

describe('the @nexusdi/meridian-deck manifest', () => {
  it('is private, free of side effects and pins pixi.js at one version', () => {
    expect(manifest.name).toBe('@nexusdi/meridian-deck');
    expect(manifest.private).toBe(true);
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.dependencies['pixi.js']).toBe('8.22.0');
  });

  it('exports the deck art as plain files with no JavaScript', () => {
    expect(manifest.exports['./art/*']).toBe('./art/*');
  });

  it('has the entries of the extension principle, the map runtime, the view and the fakes apart from the state', () => {
    expect(
      Object.keys(manifest.exports).filter((key) => key !== './package.json'),
    ).toEqual(['.', './maps', './view', './bindings', './testing', './art/*']);
    const state = manifest.exports['.'] as Record<string, string>;
    const maps = manifest.exports['./maps'] as Record<string, string>;
    const view = manifest.exports['./view'] as Record<string, string>;
    const bindings = manifest.exports['./bindings'] as Record<string, string>;
    expect(state['@nexusdi/source']).toBe('./src/state/index.ts');
    expect(maps['@nexusdi/source']).toBe('./src/maps/index.ts');
    expect(view['@nexusdi/source']).toBe('./src/view/index.ts');
    expect(bindings['@nexusdi/source']).toBe('./src/bindings/index.ts');
    const testing = manifest.exports['./testing'] as Record<string, string>;
    expect(testing['@nexusdi/source']).toBe('./src/testing/index.ts');
    expect(Object.keys(testing)).toEqual(Object.keys(state));
    expect(Object.keys(maps)).toEqual(Object.keys(state));
    expect(Object.keys(bindings)).toEqual(Object.keys(state));
  });

  it('takes meridian-systems as an optional peer and a dev dependency', () => {
    expect(manifest.peerDependencies?.[SYSTEMS]).toBe('*');
    expect(manifest.peerDependenciesMeta?.[SYSTEMS]?.optional).toBe(true);
    expect(manifest.devDependencies?.[SYSTEMS]).toBe('*');
    expect(manifest.dependencies[SYSTEMS]).toBeUndefined();
  });

  it('lists meridian-systems as external in the build', () => {
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/external:\s*\[[^\]]*@nexusdi\\\/meridian-systems/s);
    expect(config).toMatch(/maps:\s*'src\/maps\/index\.ts'/);
    expect(config).toMatch(/bindings:\s*'src\/bindings\/index\.ts'/);
  });
});

describe('the imports of the package', () => {
  it('keeps Pixi out of the state, maps, bindings and testing entries', () => {
    for (const folder of ['state', 'maps', 'bindings', 'testing']) {
      for (const { file, text } of sources(folder)) {
        const pixi = statementsOf(text).filter(({ specifier }) =>
          specifier.startsWith('pixi.js'),
        );
        expect(pixi, file).toEqual([]);
      }
    }
  });

  it('names meridian-systems nowhere in the state, view and testing entries, types included', () => {
    for (const folder of ['state', 'view', 'testing']) {
      expect(namingSystems(folder), folder).toEqual([]);
    }
  });

  it('imports meridian-systems by import type alone in the maps entry', () => {
    const statements = namingSystems('maps');
    expect(statements.length).toBeGreaterThan(0);
    for (const { file, typeOnly } of statements) {
      expect(typeOnly, file).toBe(true);
    }
  });

  it('imports meridian-systems at run time from its geometry subpath alone in the bindings entry', () => {
    const statements = namingSystems('bindings');
    expect(statements.length).toBeGreaterThan(0);
    for (const { file, specifier, typeOnly } of statements) {
      if (!typeOnly) {
        expect(specifier, file).toBe(`${SYSTEMS}/geometry`);
      }
    }
  });

  it('reads the statements of a multi-line import, and counts an inline type as run-time', () => {
    const text = [
      'import type {',
      '  A,',
      "} from '@nexusdi/meridian-systems/maps';",
      "import { type B } from '@nexusdi/meridian-systems';",
      "export type { C } from '@nexusdi/meridian-systems/geometry';",
      "export { D } from '@nexusdi/meridian-systems/geometry';",
    ].join('\n');
    expect(statementsOf(text)).toEqual([
      { specifier: '@nexusdi/meridian-systems/maps', typeOnly: true },
      { specifier: '@nexusdi/meridian-systems', typeOnly: false },
      { specifier: '@nexusdi/meridian-systems/geometry', typeOnly: true },
      { specifier: '@nexusdi/meridian-systems/geometry', typeOnly: false },
    ]);
  });

  it('lets the testing entry reach the state through relative imports only', () => {
    for (const { file, text } of sources('testing')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
      expect(text, file).not.toMatch(/\.\.\/view/);
    }
  });

  it('imports neither meridian-ui nor the docs app (P5)', () => {
    for (const { file, text } of [
      ...sources('state'),
      ...sources('maps'),
      ...sources('bindings'),
      ...sources('view'),
      ...sources('testing'),
    ]) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-ui|apps\/docs/);
    }
  });

  it('lets the view reach the state through relative imports and nothing else of the package', () => {
    for (const { file, text } of sources('view')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
    }
  });

  it('lets the bindings entry reach the state through relative imports and never the view', () => {
    for (const { file, text } of sources('bindings')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
      expect(text, file).not.toMatch(/\.\.\/view/);
    }
  });

  it('lets the maps entry reach the state through relative imports and never the view', () => {
    for (const { file, text } of sources('maps')) {
      expect(text, file).not.toMatch(/@nexusdi\/meridian-deck/);
      expect(text, file).not.toMatch(/\.\.\/view/);
    }
  });
});
