import { posix } from 'node:path';

import ts from 'typescript';

/**
 * The import rules of @nexusdi/core's layers (spec section 12).
 *
 * Each layer imports only from the layers below it. The two polyfills are
 * named on their own, because the decorator one must stay out of any bundle
 * that never imports a decorator, and the runtime needs only the disposal one.
 * testing/ reaches the package through its public entry plus internal.ts,
 * which the exports map does not publish. A root file (index.ts,
 * internal.ts) may import any layer, but not internal.ts (testing/'s alone)
 * and not the metadata polyfill (decorators/'s alone), so the same guarantee
 * that keeps a decorator-free bundle free of the polyfill holds for the
 * public entry too.
 */

export interface SourceFileText {
  /** Relative to libs/core/src, with forward slashes. */
  readonly path: string;
  readonly source: string;
}

const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  errors: ['errors/'],
  definitions: ['definitions/', 'errors/'],
  blueprint: ['blueprint/', 'definitions/', 'errors/'],
  runtime: [
    'runtime/',
    'blueprint/',
    'definitions/',
    'errors/',
    'polyfill/symbol-dispose.ts',
  ],
  decorators: [
    'decorators/',
    'definitions/',
    'errors/',
    'polyfill/symbol-metadata.ts',
  ],
  polyfill: [],
  node: ['node/', 'index.ts'],
  testing: ['testing/', 'index.ts', 'internal.ts'],
};

/** The layer a file belongs to: its first directory, or null for a root file. */
function layerOf(path: string): string | null {
  const slash = path.indexOf('/');
  return slash === -1 ? null : path.slice(0, slash);
}

/** Every module specifier a file names in an import, export-from or import(). */
function specifiersOf(file: SourceFileText): string[] {
  const source = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.ESNext,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The target path under src, with `.js` mapped back to `.ts`. */
function targetOf(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  return posix.join(posix.dirname(from), specifier).replace(/\.js$/, '.ts');
}

export function layerViolations(files: readonly SourceFileText[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const layer = layerOf(file.path);
    if (layer === null) {
      // A root file (index.ts, internal.ts) may import any layer, except that
      // internal.ts is testing/'s alone and the metadata polyfill is
      // decorators/'s alone.
      for (const specifier of specifiersOf(file)) {
        const target = targetOf(file.path, specifier);
        if (target === 'internal.ts') {
          found.push(
            `${file.path} imports internal.ts, which only testing/ may import`,
          );
        }
        if (target === 'polyfill/symbol-metadata.ts') {
          found.push(
            `${file.path} imports polyfill/symbol-metadata.ts, which only decorators/ may import`,
          );
        }
      }
      continue;
    }
    const allowed = ALLOWED[layer];
    if (allowed === undefined) {
      found.push(`${file.path} sits in ${layer}/, which is not a known layer`);
      continue;
    }
    for (const specifier of specifiersOf(file)) {
      const target = targetOf(file.path, specifier);
      if (target === null) continue;
      const ok = allowed.some((rule) =>
        rule.endsWith('/') ? target.startsWith(rule) : target === rule,
      );
      if (!ok) {
        found.push(
          `${file.path} imports ${target}, and ${layer}/ may import only ${allowed.join(', ')}`,
        );
      }
    }
  }
  return found;
}

export function nodeViolations(files: readonly SourceFileText[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file.path.startsWith('node/')) continue;
    for (const specifier of specifiersOf(file)) {
      if (specifier.startsWith('node:'))
        found.push(`${file.path} references '${specifier}'; only node/ may`);
    }
    const source = ts.createSourceFile(
      file.path,
      file.source,
      ts.ScriptTarget.ESNext,
      true,
    );
    let reported = false;
    const visit = (node: ts.Node): void => {
      if (reported) return;
      if (ts.isIdentifier(node) && node.text === 'process') {
        const parent = node.parent;
        const isPropertyAccessName =
          ts.isPropertyAccessExpression(parent) && parent.name === node;
        // `x.process` reads a property named process, not the global. But
        // `globalThis.process` names the global explicitly through the
        // one alias the layer check must also catch, so it still counts.
        const isGlobalThisProcess =
          isPropertyAccessName &&
          ts.isIdentifier(parent.expression) &&
          parent.expression.text === 'globalThis';
        const isPropertyName =
          isPropertyAccessName ||
          (ts.isPropertyAssignment(parent) && parent.name === node);
        if (!isPropertyName || isGlobalThisProcess) {
          found.push(`${file.path} references process; only node/ may`);
          reported = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
