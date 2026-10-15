import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder, TEST_FILE } from './entry-graph.js';

/**
 * Vercel Edge disables eval and new Function (integrations spec 9.6, D8).
 * The packages that claim edge support may hold neither in their source:
 * no call, no reference to eval, and no read of either off globalThis,
 * self or window.
 * Tests are exempt; a package folder that does not exist yet is skipped.
 */
export const EDGE_PACKAGES = [
  'core',
  'node',
  'errors',
  'hono',
  'react-router',
  // @nexusdi/next moved to 0.5 (integrations spec 10.1). Its folder does
  // not exist in 0.4, and the check skips an absent folder.
  'next',
] as const;

const GLOBALS = new Set(['globalThis', 'self', 'window']);
const BANNED = new Set(['eval', 'Function']);

/** True for `eval` in `eval(...)`, which the call rule reports. */
function isCallee(node: ts.Identifier): boolean {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

/** True for a name that is a member, not a reference: `x.eval`, `{ eval: 1 }`. */
function isMemberName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent)) &&
      parent.name === node)
  );
}

/** `globalThis.eval`, `self['Function']` and the like, as written; undefined otherwise. */
function globalRead(node: ts.Node): string | undefined {
  let object: ts.Expression;
  let name: string;
  if (ts.isPropertyAccessExpression(node)) {
    object = node.expression;
    name = node.name.text;
  } else if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    object = node.expression;
    name = node.argumentExpression.text;
  } else return undefined;
  if (!ts.isIdentifier(object) || !GLOBALS.has(object.text)) return undefined;
  return BANNED.has(name) ? `${object.text}.${name}` : undefined;
}

export interface EdgeSafe {
  readonly violations: string[];
  readonly scanned: { readonly packages: number; readonly files: number };
}

export function edgeSafe(root: string): EdgeSafe {
  const violations: string[] = [];
  let packages = 0;
  let files = 0;
  for (const name of EDGE_PACKAGES) {
    const src = join(root, 'libs', name, 'src');
    const sources = filesUnder(src).filter(
      (path) => /\.tsx?$/.test(path) && !TEST_FILE.test(path),
    );
    if (sources.length === 0) continue;
    packages += 1;
    for (const path of sources) {
      files += 1;
      const text = readFileSync(join(src, path), 'utf8');
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const where = `libs/${name}/src/${path}`;
      const report = (node: ts.Node, what: string) =>
        violations.push(
          `${where}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what}; Vercel Edge disables it`,
        );
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'eval'
        )
          report(node, 'calls eval(');
        else if (
          ts.isIdentifier(node) &&
          node.text === 'eval' &&
          !isCallee(node) &&
          !isMemberName(node)
        )
          report(node, 'references eval');
        if (
          (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'Function'
        )
          report(node, 'calls new Function');
        const global = globalRead(node);
        if (global !== undefined) report(node, `reads ${global}`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return { violations, scanned: { packages, files } };
}
