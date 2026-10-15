import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder, TEST_FILE } from './entry-graph.js';

/**
 * Vercel Edge disables eval and new Function (integrations spec 9.6, D8).
 * The packages that claim edge support may hold neither in their source.
 * Tests are exempt; a package folder that does not exist yet is skipped.
 */
export const EDGE_PACKAGES = [
  'core',
  'node',
  'errors',
  'hono',
  'react-router',
  'next',
] as const;

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
      const visit = (node: ts.Node): void => {
        const line = () =>
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'eval'
        )
          violations.push(
            `${where}:${line()} calls eval(; Vercel Edge disables it`,
          );
        if (
          (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'Function'
        )
          violations.push(
            `${where}:${line()} calls new Function; Vercel Edge disables it`,
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return { violations, scanned: { packages, files } };
}
