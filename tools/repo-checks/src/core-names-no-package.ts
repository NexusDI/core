import ts from 'typescript';

import { importsOf, type SourceFileText } from './core-layers.js';
import { allNodes, at, parse, type Sources } from './error-codes.js';

/**
 * P3's grep of core (spec section 1.4): core names no other package and no
 * plugin.
 *
 * The check reads core's non-test sources and fails on a module core names
 * (import, export-from, import(), import type or `declare module`) other
 * than the core package itself, on a string that names another package of
 * the scope, and on any string that starts with `nexus:`, the prefix of a
 * first-party plugin's name.
 */

const PLUGIN_NAME = /^nexus:/;

export interface CoreNames {
  readonly violations: readonly string[];
  /** What the check found to hold the rule against. */
  readonly scanned: {
    readonly files: number;
    readonly modules: number;
    readonly strings: number;
  };
}

/** A string or template part whose text starts with `nexus:`. */
function isPluginName(node: ts.Node): node is ts.LiteralLikeNode {
  return (
    (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) &&
    PLUGIN_NAME.test(node.text)
  );
}

/** Every string or template head in `sources` that starts with `nexus:`. */
export function pluginNameLiterals(sources: Sources): ts.LiteralLikeNode[] {
  return allNodes(sources)
    .map(([, node]) => node)
    .filter(isPluginName);
}

/** True when `node` names a module: the checks read those through `importsOf`. */
function isModuleName(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
      parent.moduleSpecifier === node) ||
    (ts.isModuleDeclaration(parent) && parent.name === node) ||
    (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
    (ts.isCallExpression(parent) &&
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

/** The violations of P3's grep over core's non-test `files`. */
export function coreNamesNoPackage(
  files: readonly SourceFileText[],
  scope = '@nexusdi',
): CoreNames {
  const self = `${scope}/core`;
  // A package of the scope other than core, as written inside a string.
  const other = new RegExp(`${scope}/(?!core(?![\\w-]))[\\w.-]+`);
  const violations: string[] = [];
  let modules = 0;
  let strings = 0;

  for (const file of files)
    for (const { specifier } of importsOf(file)) {
      modules++;
      if (specifier.startsWith(`${scope}/`) && specifier !== self)
        violations.push(
          `${file.path} imports ${specifier}; core names no other package`,
        );
    }

  for (const [, node] of allNodes(parse(files))) {
    if (isPluginName(node))
      violations.push(
        `${at(node)} writes the plugin name '${node.text}'; core names no plugin`,
      );
    else if (
      (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) &&
      !isModuleName(node)
    ) {
      strings++;
      const named = other.exec(node.text);
      if (named !== null)
        violations.push(
          `${at(node)} names ${named[0]} in ${node.getText()}; core names no other package`,
        );
    }
  }

  return {
    violations,
    scanned: { files: files.length, modules, strings },
  };
}
