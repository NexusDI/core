import { posix } from 'node:path';

import ts from 'typescript';

/**
 * The import rules of @nexusdi/core's layers (spec section 12).
 *
 * Each layer imports only from the layers below it. The disposal polyfill
 * is named on its own, because only the runtime needs it. A root file
 * (index.ts) may import any layer but text/.
 *
 * text/ is core's error text, published at @nexusdi/core/text. It sits
 * outside the main entry: no layer and no root file imports it. It reads
 * describeThrown and layoutText from errors/, and only types from
 * blueprint/views.ts and definitions/ (spec section 12.1).
 */

export interface SourceFileText {
  /**
   * Forward-slashed and relative to the root its check walks: libs/core/src
   * for layerViolations, libs/ for nodeViolations (spec section 12's `node:`
   * and `process` rule binds every package, not just core).
   */
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
  polyfill: [],
  text: ['text/', 'errors/', 'blueprint/views.ts', 'definitions/'],
};

/** The rules of each layer that it may import types from and nothing else. */
const TYPES_ONLY: Readonly<Record<string, readonly string[]>> = {
  text: ['blueprint/views.ts', 'definitions/'],
};

/** True when `target` matches `rule`: a folder prefix, or one file. */
export function matches(rule: string, target: string): boolean {
  return rule.endsWith('/') ? target.startsWith(rule) : target === rule;
}

/** The layer a file belongs to: its first directory, or null for a root file. */
function layerOf(path: string): string | null {
  const slash = path.indexOf('/');
  return slash === -1 ? null : path.slice(0, slash);
}

/** True when an import or export-from brings in types only. */
function isTypeOnly(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    return (
      clause !== undefined &&
      ts.isNamedExports(clause) &&
      clause.elements.length > 0 &&
      clause.elements.every((element) => element.isTypeOnly)
    );
  }
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

/** A module specifier a file names, and whether it brings in types only. */
export interface ImportOf {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

/**
 * One file's syntax tree, with parent links, named by its path. A check
 * parses each file once and hands the tree to every reader.
 */
export function parseFile(file: SourceFileText): ts.SourceFile {
  return ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.ESNext,
    true,
  );
}

/** Each file's syntax tree, by its path. */
export type Sources = ReadonlyMap<string, ts.SourceFile>;

/** Each file of `files` parsed once, by its path. */
export function parse(files: readonly SourceFileText[]): Sources {
  return new Map(files.map((file) => [file.path, parseFile(file)]));
}

/**
 * Every module a file names: import, export-from, import(), an import type
 * and a `declare module` block.
 */
export function importsOf(source: ts.SourceFile): ImportOf[] {
  const found: ImportOf[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: isTypeOnly(node),
      });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    // `typeof import('x')` in a type, and `declare module 'x'`.
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      found.push({ specifier: node.argument.literal.text, typeOnly: true });
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))
      found.push({ specifier: node.name.text, typeOnly: true });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The specifier of every module `importsOf` reads in a file. */
export function specifiersOf(source: ts.SourceFile): string[] {
  return importsOf(source).map((found) => found.specifier);
}

/** The module a relative specifier names among `paths`, or null. */
export function resolveRelative(
  from: string,
  specifier: string,
  paths: ReadonlySet<string>,
): string | null {
  const joined = posix.join(posix.dirname(from), specifier);
  for (const candidate of [
    joined.replace(/\.js$/, '.ts'),
    joined,
    `${joined}.ts`,
    `${joined}/index.ts`,
  ])
    if (paths.has(candidate)) return candidate;
  return null;
}

/**
 * The target path under src: the module `resolveRelative` finds among
 * `paths`, so `./text` names `text/index.ts`, or else the specifier with
 * `.js` mapped back to `.ts`. Null for a package specifier.
 */
function targetOf(
  from: string,
  specifier: string,
  paths: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith('.')) return null;
  return (
    resolveRelative(from, specifier, paths) ??
    posix.join(posix.dirname(from), specifier).replace(/\.js$/, '.ts')
  );
}

export function layerViolations(files: readonly SourceFileText[]): string[] {
  const found: string[] = [];
  const paths = new Set(files.map((file) => file.path));
  for (const file of files) {
    const imports = importsOf(parseFile(file));
    const layer = layerOf(file.path);
    if (layer === null) {
      // A root file (index.ts) may import any layer but text/.
      for (const { specifier } of imports) {
        const target = targetOf(file.path, specifier, paths);
        if (target?.startsWith('text/'))
          found.push(
            `${file.path} imports ${target}, and the main entry may not reach text/`,
          );
      }
      continue;
    }
    const allowed = ALLOWED[layer];
    if (allowed === undefined) {
      found.push(`${file.path} sits in ${layer}/, which is not a known layer`);
      continue;
    }
    for (const { specifier } of imports) {
      const target = targetOf(file.path, specifier, paths);
      if (target === null) continue;
      if (!allowed.some((rule) => matches(rule, target))) {
        found.push(
          `${file.path} imports ${target}, and ${layer}/ may import only ${allowed.join(', ')}`,
        );
      }
    }
    const typesOnly = TYPES_ONLY[layer] ?? [];
    for (const { specifier, typeOnly } of imports) {
      if (typeOnly) continue;
      const target = targetOf(file.path, specifier, paths);
      if (target === null || !typesOnly.some((rule) => matches(rule, target)))
        continue;
      found.push(
        `${file.path} imports values from ${target}, and ${layer}/ may import only types from ${typesOnly.join(', ')}`,
      );
    }
  }
  return found;
}

/**
 * Package sources that run on Node only and may use node: modules and
 * process: @nexusdi/node, which owns AsyncLocalStorage, and @nexusdi/cli, a
 * bin no app bundles.
 */
const NODE_ONLY = ['node/src/', 'cli/src/'];

export function nodeViolations(files: readonly SourceFileText[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (NODE_ONLY.some((prefix) => file.path.startsWith(prefix))) continue;
    const source = parseFile(file);
    for (const specifier of specifiersOf(source)) {
      if (specifier.startsWith('node:'))
        found.push(`${file.path} references '${specifier}'; only node/ may`);
    }
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
