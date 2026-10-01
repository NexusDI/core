import ts from 'typescript';

import type { SourceFileText, Sources } from './core-layers.js';
import { subpathEntryOf, walkEntry } from './entry-graph.js';

/**
 * The error codes a package declares and the pack entries that give them
 * text, read from source, with the AST helpers the repo checks share.
 */

/** One package's non-test sources, with paths relative to its src/. */
export interface PackageFiles {
  /** The package name the policy entries key on, such as `@nexusdi/testing`. */
  readonly name: string;
  readonly files: readonly SourceFileText[];
}

/** Every node under `root`, depth first. */
export function nodesOf(root: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

export function allNodes(sources: Sources): [ts.SourceFile, ts.Node][] {
  return [...sources.values()].flatMap((sf) =>
    nodesOf(sf).map((node): [ts.SourceFile, ts.Node] => [sf, node]),
  );
}

export function at(node: ts.Node): string {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  return `${sf.fileName}:${line + 1}`;
}

/** A property or member name as written, when it is a plain name or string. */
export function nameOf(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

/** `expr` without parentheses, `as`, `satisfies` and `!`. */
export function unwrap(expr: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr)
  )
    expr = expr.expression;
  return expr;
}

/** The codes of every `interface NexusErrorByCode` block, in source order. */
export function declaredCodes(sources: Sources): string[] {
  const codes = allNodes(sources).flatMap(([, node]) =>
    ts.isInterfaceDeclaration(node) && node.name.text === 'NexusErrorByCode'
      ? node.members.flatMap((member) => nameOf(member.name) ?? [])
      : [],
  );
  return [...new Set(codes)];
}

function isErrorTextPack(type: ts.TypeNode | undefined): boolean {
  return (
    type !== undefined &&
    ts.isTypeReferenceNode(type) &&
    (ts.isIdentifier(type.typeName)
      ? type.typeName.text
      : type.typeName.right.text) === 'ErrorTextPack'
  );
}

/**
 * The keys of each pack the package's `./text` export ships: an object
 * literal that satisfies, or is typed as, `ErrorTextPack`, in any module
 * the export's source file reaches through value imports. None for a
 * package with no `./text` export.
 */
export function packCodes(sources: Sources, exports: unknown): string[] {
  const entry = subpathEntryOf(exports, './text');
  if (typeof entry !== 'string') return [];
  const shipped = new Set<string>();
  for (const step of walkEntry(sources, entry))
    if (step.kind === 'module') shipped.add(step.path);
  const texts = new Map([...sources].filter(([path]) => shipped.has(path)));
  const codes = allNodes(texts).flatMap(([, node]) => {
    let pack: ts.Expression | undefined;
    if (ts.isSatisfiesExpression(node) && isErrorTextPack(node.type))
      pack = node.expression;
    if (ts.isVariableDeclaration(node) && isErrorTextPack(node.type))
      pack = node.initializer;
    if (pack === undefined) return [];
    pack = unwrap(pack);
    if (!ts.isObjectLiteralExpression(pack)) return [];
    return pack.properties.flatMap((property) => nameOf(property.name) ?? []);
  });
  return [...new Set(codes)];
}

/** The class names every `instanceof` in `sources` tests against. */
export function instanceofClasses(sources: Sources): string[] {
  const names = allNodes(sources).flatMap(([, node]) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    ts.isIdentifier(node.right)
      ? [node.right.text]
      : [],
  );
  return [...new Set(names)].sort();
}
