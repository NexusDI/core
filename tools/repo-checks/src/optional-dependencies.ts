import ts from 'typescript';

import { importsOf } from './core-layers.js';
import { pluginNameLiterals } from './core-names-no-package.js';
import { type LibPackage, mainEntryOf, walkEntry } from './entry-graph.js';
import { allNodes, at, parse, unwrap } from './error-codes.js';

/**
 * P5: optional dependencies point one way and degrade by construction (spec
 * section 1.6).
 *
 * A package names an optional package of the scope (errors, devtools and
 * node, spec sections 1.6 and 2.5.8) only as an optional peer, unless an
 * allowance names the pair. It may require any other package of the scope,
 * as @nexusdi/vitest requires @nexusdi/testing (integrations spec 8.3).
 * Over each package's non-test sources the check fails on:
 *
 * - an import of a package of the scope, types included, that the manifest
 *   names in neither `dependencies` nor `peerDependencies`;
 * - a value import of an optional peer in a module the main entry reaches
 *   by value, since only `import type` and subpath entries may name one;
 * - `import()` of a package of the scope, which detects a package at run
 *   time;
 * - a string that starts with `nexus:` anywhere but a plugin's own `name`
 *   property, since a plugin found by its name is a plugin looked up by
 *   name.
 *
 * A package without a `.` export, such as a bin, has no main entry to walk;
 * the other rules still hold for it.
 */

/** A package of the scope that `package` may require, with its reason. */
export interface DependencyAllowance {
  readonly package: string;
  readonly dependency: string;
  readonly reason: string;
}

export interface OptionalDependencies {
  readonly violations: readonly string[];
  /** `<package> <dependency>` for each allowance a package used. */
  readonly used: ReadonlySet<string>;
  /** What the check found to hold the rule against. */
  readonly scanned: {
    readonly files: number;
    readonly imports: number;
    readonly mainEntries: number;
  };
}

/** The packages of the scope an application opts into (spec section 1.6). */
const OPTIONAL_PACKAGES = ['errors', 'devtools', 'node'];

/** The package a specifier names: `@scope/name` of `@scope/name/sub`. */
const packageOf = (specifier: string): string =>
  specifier.split('/').slice(0, 2).join('/');

/** True when `node` is the value of a `name` property in an object literal. */
function isOwnName(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    ts.isObjectLiteralExpression(parent.parent) &&
    (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
    parent.name.text === 'name'
  );
}

/** The argument of an `import()` call when it starts with `prefix`. */
function runtimeImportOf(node: ts.Node, prefix: string): string | undefined {
  if (
    !ts.isCallExpression(node) ||
    node.expression.kind !== ts.SyntaxKind.ImportKeyword
  )
    return undefined;
  const [argument] = node.arguments;
  if (argument === undefined) return undefined;
  const expr = unwrap(argument);
  const text = ts.isStringLiteralLike(expr)
    ? expr.text
    : ts.isTemplateExpression(expr)
      ? expr.head.text
      : undefined;
  return text?.startsWith(prefix) === true ? argument.getText() : undefined;
}

/** The violations of P5 across `packages`. */
export function optionalDependencies(
  packages: readonly LibPackage[],
  allowlist: readonly DependencyAllowance[],
  scope = '@nexusdi',
): OptionalDependencies {
  const prefix = `${scope}/`;
  const optionalPackages = new Set(
    OPTIONAL_PACKAGES.map((name) => `${scope}/${name}`),
  );
  const violations: string[] = [];
  const used = new Set<string>();
  const scanned = { files: 0, imports: 0, mainEntries: 0 };

  for (const pkg of packages) {
    const report = (violation: string) =>
      violations.push(`${pkg.name} ${violation}`);
    const files = pkg.files;
    scanned.files += files.length;

    // The manifest requires no optional package.
    const optional = new Set(pkg.optionalPeers);
    for (const [field, required] of [
      ['dependencies', Object.keys(pkg.dependencies)],
      [
        'peerDependencies',
        Object.keys(pkg.peerDependencies).filter((peer) => !optional.has(peer)),
      ],
    ] as const)
      for (const dependency of required) {
        if (!optionalPackages.has(dependency)) continue;
        if (
          allowlist.some(
            (entry) =>
              entry.package === pkg.name && entry.dependency === dependency,
          )
        )
          used.add(`${pkg.name} ${dependency}`);
        else
          report(
            `package.json requires ${dependency} in ${field}; ${dependency} is an optional package, so name it as an optional peer`,
          );
      }

    let main: string | null = null;
    try {
      main = mainEntryOf(pkg.exports);
    } catch {
      report(
        'package.json has a . export with no @nexusdi/source file, so the main entry cannot be walked',
      );
    }

    // Every import of the scope is declared.
    const declared = new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.peerDependencies),
    ]);
    const sources = parse(files);
    for (const file of files) {
      for (const { specifier } of importsOf(file)) {
        if (!specifier.startsWith(prefix)) continue;
        scanned.imports++;
        if (!declared.has(packageOf(specifier)))
          report(
            `${file.path} imports ${packageOf(specifier)}, which package.json names in neither dependencies nor peerDependencies`,
          );
      }
      const sf = sources.get(file.path);
      if (sf === undefined) continue;
      const single = new Map([[file.path, sf]]);
      for (const node of pluginNameLiterals(single))
        if (!isOwnName(node))
          report(
            `${at(node)} writes the plugin name '${node.text}' outside a plugin's own name; reach the plugin through what its owner exports`,
          );
      for (const [, node] of allNodes(single)) {
        const argument = runtimeImportOf(node, prefix);
        if (argument !== undefined)
          report(
            `${at(node)} calls import(${argument}); name the package in import type or from a subpath entry the application imports`,
          );
      }
    }

    // No module the main entry reaches imports an optional peer by value.
    if (main === null) continue;
    const byPath = new Map(files.map((file) => [file.path, file]));
    if (!byPath.has(main)) {
      report(`src/${main} is missing, so the main entry cannot be walked`);
      continue;
    }
    scanned.mainEntries++;
    for (const step of walkEntry(files, main)) {
      const file = byPath.get(step.path);
      if (step.kind !== 'module' || file === undefined) continue;
      for (const { specifier, typeOnly } of importsOf(file))
        if (!typeOnly && optional.has(packageOf(specifier)))
          report(
            `${step.path} imports ${packageOf(specifier)} by value, an optional peer, and the main entry reaches it (${step.chain}); import it as a type or from a subpath entry`,
          );
    }
  }

  return { violations, used, scanned };
}
