import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder, TEST_FILE } from './entry-graph.js';

/**
 * A published package installs every entry of its `dependencies` for every
 * user, so each must be one its source imports. A package only the tests,
 * a fixture or a generated entry use belongs in devDependencies.
 */
export interface RuntimeDependencies {
  readonly violations: readonly string[];
  /** The published packages scanned. */
  readonly scanned: number;
}

/** The package an import specifier names: `a` from `a/b`, `@s/a` from `@s/a/b`. */
function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('node:'))
    return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : (parts[0] as string);
}

/** Every package a source file imports, exports from or loads with import(). */
function importsOf(path: string, text: string): Set<string> {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const add = (node: ts.Expression | undefined) => {
    if (node === undefined || !ts.isStringLiteralLike(node)) return;
    const name = packageOf(node.text);
    if (name !== undefined) found.add(name);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      add(node.moduleSpecifier);
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `manifest` names each package's manifest file; fixtures pass another name, so Nx does not read them as projects. */
export function runtimeDependencies(
  root: string,
  manifest = 'package.json',
): RuntimeDependencies {
  const libs = join(root, 'libs');
  const violations: string[] = [];
  let scanned = 0;
  for (const name of readdirSync(libs).sort()) {
    const manifestPath = join(libs, name, manifest);
    if (!existsSync(manifestPath)) continue;
    const declared = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    if (declared.private === true) continue;
    scanned += 1;
    const src = join(libs, name, 'src');
    const imported = new Set<string>();
    for (const path of filesUnder(src).filter(
      (file) => /\.[cm]?tsx?$/.test(file) && !TEST_FILE.test(file),
    ))
      for (const dep of importsOf(path, readFileSync(join(src, path), 'utf8')))
        imported.add(dep);
    for (const dep of Object.keys(declared.dependencies ?? {}))
      if (!imported.has(dep))
        violations.push(
          `libs/${name}/${manifest} lists ${dep} in dependencies, and no file in libs/${name}/src imports it; move it to devDependencies or drop it`,
        );
  }
  return { violations, scanned };
}
