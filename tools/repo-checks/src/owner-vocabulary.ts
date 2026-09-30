import ts from 'typescript';

import {
  allNodes,
  at,
  declaredCodes,
  type PackageFiles,
  parse,
  type Sources,
  unwrap,
} from './error-codes.js';

/**
 * P1: the owner holds its vocabulary (spec section 1.2).
 *
 * A package reads another package's codes and brands only through what the
 * owner exports. The check reads each package's non-test sources and fails
 * on (a) a string literal or name equal to a code another package declares
 * in `NexusErrorByCode`, (b) `Symbol.for('nexusdi.<name>')` on a key another
 * package defines, and (c) a prefix test on a code: a method call on a
 * `code` value, a pattern test of one, or a code prefix such as `'NEXUS_'`
 * written anywhere.
 *
 * A package defines a key when it binds the key to an exported top-level
 * const. A key two packages call with no single definer fails in both. A
 * `Symbol.for` with a key that is not a string literal, or `Symbol.for`
 * handed on as a value, fails closed.
 *
 * The check does not look for literals equal to a core-internal id; review
 * catches those.
 */

/** One equality check on one public code, allowed in each package it names. */
export interface VocabularyAllowance {
  readonly code: string;
  readonly packages: readonly string[];
  readonly reason: string;
}

export interface OwnerVocabulary {
  readonly violations: readonly string[];
  /** `<package> <code>` for each allowance a package used. */
  readonly used: ReadonlySet<string>;
  /** What the check found to hold the rule against. */
  readonly scanned: {
    readonly files: number;
    readonly codes: number;
    readonly brands: number;
  };
}

const BRAND_KEY = /^nexusdi\./;
/** A code fragment: `NEXUS_`, `^NEXUS_` or a partial code ending in `_`. */
const CODE_PREFIX = /^\^?NEXUS_(?:[A-Z0-9_]*_)?$/;

interface Parsed {
  readonly name: string;
  readonly sources: Sources;
}

/** A `Symbol.for` callee: `Symbol.for` or `Symbol['for']`. */
function isSymbolFor(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node))
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Symbol' &&
      node.name.text === 'for'
    );
  return (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Symbol' &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    node.argumentExpression.text === 'for'
  );
}

/** True when `call` initialises an exported top-level const. */
function isExportedConst(call: ts.CallExpression): boolean {
  let node: ts.Node = call.parent;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.parent;
  const statement = node.parent?.parent;
  return (
    ts.isVariableDeclaration(node) &&
    statement !== undefined &&
    ts.isVariableStatement(statement) &&
    ts.isSourceFile(statement.parent) &&
    (statement.modifiers ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/** The `nexusdi.` key a `Symbol.for(...)` call names, when it names one. */
function brandKey(call: ts.CallExpression): string | undefined {
  const [key] = call.arguments;
  return key !== undefined &&
    ts.isStringLiteralLike(key) &&
    BRAND_KEY.test(key.text)
    ? key.text
    : undefined;
}

/** `code`, `x.code` or `x['code']`. */
function isCode(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  return (
    (ts.isIdentifier(node) && node.text === 'code') ||
    (ts.isPropertyAccessExpression(node) && node.name.text === 'code') ||
    (ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'code')
  );
}

/** A string, template head or pattern that holds a code prefix. */
function isPrefixLiteral(node: ts.Node): boolean {
  if (ts.isRegularExpressionLiteral(node)) return node.text.includes('NEXUS_');
  return (
    (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) &&
    CODE_PREFIX.test(node.text)
  );
}

/**
 * True when `call` tests a code by its text: a method on a code, a pattern
 * test of a code, or a method given a code prefix.
 */
function isPrefixTest(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (
    !ts.isPropertyAccessExpression(callee) &&
    !ts.isElementAccessExpression(callee)
  )
    return false;
  const method = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : undefined;
  return (
    isCode(callee.expression) ||
    ((method === 'test' || method === 'exec') && call.arguments.some(isCode)) ||
    call.arguments.some((argument) => isPrefixLiteral(unwrap(argument)))
  );
}

function isEquality(node: ts.Node): boolean {
  const parent = node.parent;
  if (!ts.isBinaryExpression(parent)) return false;
  const kind = parent.operatorToken.kind;
  return (
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken
  );
}

/** Each package that declares a code, by code. */
function codeOwners(packages: readonly PackageFiles[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const pkg of packages)
    for (const code of declaredCodes(pkg.files))
      owners.set(code, [...(owners.get(code) ?? []), pkg.name]);
  return owners;
}

/** Each package that calls `Symbol.for` on a key, and each that exports it. */
function brandOwners(
  parsed: readonly Parsed[],
): Map<string, { callers: Set<string>; definers: Set<string> }> {
  const owners = new Map<
    string,
    { callers: Set<string>; definers: Set<string> }
  >();
  for (const { name, sources } of parsed)
    for (const [, node] of allNodes(sources)) {
      if (!ts.isCallExpression(node) || !isSymbolFor(node.expression)) continue;
      const key = brandKey(node);
      if (key === undefined) continue;
      const owner = owners.get(key) ?? {
        callers: new Set<string>(),
        definers: new Set<string>(),
      };
      owner.callers.add(name);
      if (isExportedConst(node)) owner.definers.add(name);
      owners.set(key, owner);
    }
  return owners;
}

const list = (names: Iterable<string>): string => [...names].join(' and ');

/**
 * The violations of P1 across `packages`, which the check reads together to
 * learn who declares each code and defines each key.
 */
export function ownerVocabulary(
  packages: readonly PackageFiles[],
  allowlist: readonly VocabularyAllowance[],
): OwnerVocabulary {
  const parsed = packages.map((pkg) => ({
    name: pkg.name,
    sources: parse(pkg.files),
  }));
  const codes = codeOwners(packages);
  const brands = brandOwners(parsed);
  const violations: string[] = [];
  const used = new Set<string>();
  /** The site that holds each used allowance, by `<package> <code>`. */
  const heldAt = new Map<string, string>();

  for (const { name, sources } of parsed) {
    const tested = new Set<ts.Node>();
    const where = (node: ts.Node) => `${name} ${at(node)}`;
    for (const [, node] of allNodes(sources)) {
      // (a) A code another package declares.
      if (ts.isStringLiteralLike(node) || ts.isIdentifier(node)) {
        const owners = codes.get(node.text);
        if (owners !== undefined && !owners.includes(name)) {
          const key = `${name} ${node.text}`;
          const allowed =
            ts.isStringLiteralLike(node) &&
            isEquality(node) &&
            allowlist.some(
              (entry) =>
                entry.code === node.text && entry.packages.includes(name),
            );
          const held = heldAt.get(key);
          const declared = `${where(node)} names ${node.text}, a code ${list(owners)} declares`;
          if (allowed && held === undefined) {
            used.add(key);
            heldAt.set(key, at(node));
          } else if (allowed)
            violations.push(
              `${declared}; its allowance covers one equality check, and ${held} holds it`,
            );
          else
            violations.push(
              `${declared}; read it through what the owner exports`,
            );
        }
      }

      // (b) Symbol.for on a key another package defines.
      if (isSymbolFor(node)) {
        const call = node.parent;
        if (!ts.isCallExpression(call) || call.expression !== node)
          violations.push(
            `${where(node)} uses Symbol.for other than as a call, and the check cannot follow it; call Symbol.for where it is written`,
          );
        else if (!call.arguments.every(ts.isStringLiteralLike))
          violations.push(
            `${where(call)} calls Symbol.for with a key the check cannot read; pass a string literal`,
          );
        else {
          const key = brandKey(call);
          const owner = key === undefined ? undefined : brands.get(key);
          if (owner !== undefined && owner.callers.size > 1) {
            const [definer] = owner.definers;
            if (owner.definers.size !== 1)
              violations.push(
                `${where(call)} calls Symbol.for('${key}'), which ${list(owner.callers)} call and ${owner.definers.size === 0 ? 'none exports' : `${list(owner.definers)} each export`}; one package defines the key and exports it`,
              );
            else if (definer !== name)
              violations.push(
                `${where(call)} calls Symbol.for('${key}'), a key ${definer} defines; import the owner's export`,
              );
          }
        }
      }

      // (c) A prefix test on a code, or a code prefix written anywhere.
      if (ts.isCallExpression(node) && isPrefixTest(node)) {
        tested.add(node);
        violations.push(
          `${where(node)} tests a code by its text with ${node.expression.getText()}; test the error through what its owner exports`,
        );
      } else if (isPrefixLiteral(node)) {
        let parent: ts.Node | undefined = node.parent;
        while (parent !== undefined && !tested.has(parent))
          parent = parent.parent;
        if (parent === undefined)
          violations.push(
            `${where(node)} writes the code prefix ${node.getText()}; test the error through what its owner exports`,
          );
      }
    }
  }

  return {
    violations,
    used,
    scanned: {
      files: packages.reduce((sum, pkg) => sum + pkg.files.length, 0),
      codes: codes.size,
      brands: brands.size,
    },
  };
}
