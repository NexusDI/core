import ts from 'typescript';

import { parse, type Sources } from './core-layers.js';
import { subpathEntryOf } from './entry-graph.js';
import {
  allNodes,
  at,
  nameOf,
  type PackageFiles,
  unwrap,
} from './error-codes.js';
import { checkerOf, isLibFile, type Packages } from './type-checker.js';

/**
 * P1 for trace event types (spec section 1.2): a package reads another
 * package's event types only through the union the owner exports.
 *
 * The vocabulary is the keys of every `TraceEventByType` declaration: core's
 * interface and each augmentation, keyed `<package>/<event>`. The package
 * that declares a key owns it.
 *
 * A trace read is one of these, resolved by a type checker over the package
 * and the packages it imports:
 * - a `type` property declared in the owner's `TraceEvent`
 * - a `TraceEventByType` field typed as a union of string literals
 * - a value typed as a union of two or more event types, or as a type
 *   parameter constrained to them
 * - a destructure of any of these, or an unannotated variable bound to one
 *
 * A read of another package's vocabulary may be compared with `===` or
 * `!==` against a literal or another read, switched on with a default
 * clause, or passed where the compiler types it as the owner's union. A
 * table lookup, a call to a built-in, a text operation and a widening to
 * `string` fail.
 *
 * A literal of another package's `<package>/<event>` key fails outside a
 * compare with a read, a case of a switch on a read, a literal type and a
 * call argument the owner's union types. Core's keys, such as `init`, are
 * also plain words, so the check leaves their literals to the read rules.
 */

/** A package as the check reads it: its manifest `exports` name its entries. */
export interface EventPackage extends PackageFiles {
  readonly exports?: unknown;
}

interface Parsed {
  readonly name: string;
  readonly sources: Sources;
  readonly exports?: unknown;
}

const BY_TYPE = 'TraceEventByType';
const EVENT = 'TraceEvent';
const BRANCH =
  "compare it with === against the owner's union, or switch on it with a default";
/** A source that names a trace event type or hands a plugin an observe hook. */
const USES_TRACE = /\b(?:TraceEvent|TraceEventByType|observe)\b/;

const list = (names: Iterable<string>): string => [...names].join(' and ');

/** The `interface TraceEventByType` block a node sits in, if any. */
function byTypeOf(node: ts.Node): ts.InterfaceDeclaration | undefined {
  for (let scope: ts.Node | undefined = node; scope; scope = scope.parent)
    if (ts.isInterfaceDeclaration(scope))
      return scope.name.text === BY_TYPE ? scope : undefined;
  return undefined;
}

/** One member of an `interface TraceEventByType` block. */
interface Declared {
  readonly name: string;
  readonly member: ts.TypeElement;
  readonly key: string;
}

/** Each event type each package declares, in source order. */
function declaredEvents(packages: readonly Parsed[]): Declared[] {
  return packages.flatMap(({ name, sources }) =>
    allNodes(sources).flatMap(([, node]) =>
      ts.isInterfaceDeclaration(node) && node.name.text === BY_TYPE
        ? node.members.flatMap((member) => {
            const key = nameOf(member.name);
            return key === undefined ? [] : [{ name, member, key }];
          })
        : [],
    ),
  );
}

/**
 * Each specifier a package's `exports` names, such as `@acme/core/text`,
 * by its source path relative to src/.
 */
function entriesOf(pkg: Parsed): [string, string][] {
  if (typeof pkg.exports !== 'object' || pkg.exports === null) return [];
  return Object.keys(pkg.exports).flatMap((subpath): [string, string][] => {
    const entry = subpathEntryOf(pkg.exports, subpath);
    return typeof entry === 'string'
      ? [[`${pkg.name}${subpath.slice(1)}`, entry]]
      : [];
  });
}

/**
 * True when the check builds a program for `pkg`: its source names a trace
 * event type, an observe hook or another package's key. A package that
 * declares `TraceEvent` itself is core, which names no other package (P3),
 * so every event type it reads is its own.
 */
function readsTrace(pkg: Parsed, foreignKeys: readonly string[]): boolean {
  let names = false;
  for (const source of pkg.sources.values()) {
    if (
      source.statements.some(
        (statement) =>
          ts.isTypeAliasDeclaration(statement) && statement.name.text === EVENT,
      )
    )
      return false;
    names ||=
      USES_TRACE.test(source.text) ||
      foreignKeys.some((key) => source.text.includes(key));
  }
  return names;
}

/** `type` with every `null` and `undefined` member removed. */
function nonNullMembers(type: ts.Type): ts.Type[] {
  return (type.isUnion() ? type.types : [type]).filter(
    (member) =>
      (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0,
  );
}

/** True when `type` is `string` or a union that holds it. */
function holdsString(type: ts.Type): boolean {
  return (type.isUnion() ? type.types : [type]).some(
    (member) => (member.flags & ts.TypeFlags.String) !== 0,
  );
}

/** True for `===`, `!==`, `==` and `!=`. */
function isEquality(node: ts.BinaryExpression): boolean {
  const kind = node.operatorToken.kind;
  return (
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken
  );
}

/** Reads one package's source with a checker that resolves the packages it imports. */
class Reader {
  readonly #name: string;
  readonly #checker: ts.TypeChecker;
  readonly #keys: ReadonlyMap<string, readonly string[]>;
  readonly #ownerOfFile: (file: ts.SourceFile) => string | undefined;
  readonly #reads = new Map<ts.Node, ReadonlySet<string> | undefined>();

  constructor(
    name: string,
    checker: ts.TypeChecker,
    keys: ReadonlyMap<string, readonly string[]>,
    ownerOfFile: (file: ts.SourceFile) => string | undefined,
  ) {
    this.#name = name;
    this.#checker = checker;
    this.#keys = keys;
    this.#ownerOfFile = ownerOfFile;
  }

  /**
   * The owners of the event types `type` holds, when it is a union of two or
   * more event types or a type parameter constrained to event types. One
   * literal is no read: `'init'` alone is as likely a hook name as an event.
   */
  #keyOwners(type: ts.Type, min = 2): Set<string> | undefined {
    const resolved =
      (type.flags & ts.TypeFlags.TypeParameter) !== 0
        ? this.#checker.getBaseConstraintOfType(type)
        : type;
    if (resolved === undefined) return undefined;
    const members = resolved.isUnion() ? resolved.types : [resolved];
    if (members.length < min) return undefined;
    const owners = new Set<string>();
    for (const member of members) {
      const key = member.isStringLiteral() ? member.value : undefined;
      const declared = key === undefined ? undefined : this.#keys.get(key);
      if (declared === undefined) return undefined;
      for (const owner of declared) owners.add(owner);
    }
    return owners;
  }

  /** The owner of a `TraceEvent` `type` property or a literal-union field of a `TraceEventByType` entry. */
  #propertyOwners(
    symbol: ts.Symbol | undefined,
    node: ts.Node,
  ): Set<string> | undefined {
    for (const declaration of symbol?.declarations ?? []) {
      const owner = this.#ownerOfFile(declaration.getSourceFile());
      if (owner === undefined || !ts.isPropertySignature(declaration)) continue;
      let alias: ts.Node | undefined = declaration;
      while (alias !== undefined && !ts.isTypeAliasDeclaration(alias))
        alias = alias.parent;
      if (symbol?.name === 'type' && alias?.name.text === EVENT)
        return (
          this.#keyOwners(this.#checker.getTypeAtLocation(node), 1) ??
          new Set([owner])
        );
      const entry = declaration.parent.parent;
      if (
        declaration.type !== undefined &&
        ts.isTypeLiteralNode(declaration.parent) &&
        ts.isPropertySignature(entry) &&
        byTypeOf(entry)?.members.includes(entry) === true
      ) {
        const members = nonNullMembers(
          this.#checker.getTypeFromTypeNode(declaration.type),
        );
        if (
          members.length > 0 &&
          members.every((member) => member.isStringLiteral())
        )
          return new Set([owner]);
      }
    }
    return undefined;
  }

  #readOwners(node: ts.Node): ReadonlySet<string> | undefined {
    if (this.#reads.has(node)) return this.#reads.get(node);
    this.#reads.set(node, undefined);
    const owners = this.#declaredOwners(node) ?? this.#typedOwners(node);
    this.#reads.set(node, owners);
    return owners;
  }

  #typedOwners(node: ts.Node): Set<string> | undefined {
    return ts.isExpression(node)
      ? this.#keyOwners(this.#checker.getTypeAtLocation(node))
      : undefined;
  }

  #declaredOwners(
    node: ts.Node,
  ): Set<string> | ReadonlySet<string> | undefined {
    if (ts.isPropertyAccessExpression(node))
      return this.#propertyOwners(
        this.#checker.getSymbolAtLocation(node.name),
        node,
      );
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    )
      return this.#propertyOwners(
        this.#checker.getSymbolAtLocation(node.argumentExpression),
        node,
      );
    if (!ts.isIdentifier(node)) return undefined;
    const declaration =
      this.#checker.getSymbolAtLocation(node)?.valueDeclaration;
    if (
      declaration !== undefined &&
      ts.isBindingElement(declaration) &&
      ts.isObjectBindingPattern(declaration.parent)
    ) {
      const key =
        nameOf(declaration.propertyName) ??
        (ts.isIdentifier(declaration.name) ? declaration.name.text : undefined);
      const pattern = this.#checker.getTypeAtLocation(declaration.parent);
      return key === undefined
        ? undefined
        : this.#propertyOwners(pattern.getProperty(key), node);
    }
    // A variable with a type annotation holds what the annotation says; its
    // type, read below, decides whether it still holds event types.
    if (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.type === undefined &&
      declaration.initializer !== undefined
    )
      return this.#readOwners(unwrap(declaration.initializer));
    return undefined;
  }

  /** True when `node` reads trace event vocabulary, the reader's own or another package's. */
  isRead(node: ts.Node): boolean {
    return this.#readOwners(node) !== undefined;
  }

  /** True when `node` reads trace event vocabulary another package owns. */
  isForeignRead(node: ts.Node): boolean {
    const owners = this.#readOwners(node);
    return (
      owners !== undefined && [...owners].some((owner) => owner !== this.#name)
    );
  }

  /** True when `node` names a value, and is no declaration name, property name or type. */
  isValueName(node: ts.Identifier): boolean {
    const symbol = this.#checker.getSymbolAtLocation(node);
    return (
      symbol !== undefined &&
      (symbol.flags & ts.SymbolFlags.Variable) !== 0 &&
      !(symbol.declarations ?? []).some(
        (declaration) => ts.getNameOfDeclaration(declaration) === node,
      )
    );
  }

  /** True when an equality compares a read with a value the compiler types against the owner's union. */
  #checked(other: ts.Expression): boolean {
    const node = unwrap(other);
    return (
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) && node.text === 'undefined') ||
      this.isRead(node)
    );
  }

  /** What is wrong with the position of `read`, a foreign read, if anything. */
  misuse(read: ts.Expression): string | undefined {
    const text = read.getText();
    let node: ts.Node = read;
    let parent = node.parent;
    while (
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    ) {
      if (
        (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) &&
        holdsString(this.#checker.getTypeFromTypeNode(parent.type))
      )
        return `widens ${text} to string; ${BRANCH}`;
      node = parent;
      parent = parent.parent;
    }
    if (ts.isSwitchStatement(parent) && parent.expression === node)
      return parent.caseBlock.clauses.some(ts.isDefaultClause)
        ? undefined
        : `switches on ${text} with no default branch; add a default for an event type or value the owner adds later (P2)`;
    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;
      const other = parent.left === node ? parent.right : parent.left;
      if (isEquality(parent))
        return this.#checked(other)
          ? undefined
          : `compares ${text} with ${other.getText()}, which the compiler does not check against the owner's union; compare it with a literal of the union`;
      if (operator === ts.SyntaxKind.InKeyword && parent.left === node)
        return `looks up ${text} in ${parent.right.getText()}; ${BRANCH}`;
      if (
        operator === ts.SyntaxKind.PlusToken ||
        operator === ts.SyntaxKind.PlusEqualsToken
      )
        return `joins ${text} into a string with +; ${BRANCH}`;
    }
    if (
      ts.isElementAccessExpression(parent) &&
      parent.argumentExpression === node
    )
      return `looks up ${text} in ${parent.expression.getText()}; ${BRANCH}`;
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === node
    )
      return `reads the text of ${text} with ${parent.getText()}; ${BRANCH}`;
    if (ts.isTemplateSpan(parent))
      return `writes ${text} into a template literal; ${BRANCH}`;
    if (
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.arguments?.includes(node as ts.Expression) === true
    ) {
      const callee = this.#checker.getResolvedSignature(parent)?.declaration;
      if (callee !== undefined && isLibFile(callee.getSourceFile()))
        return `passes ${text} to ${parent.expression.getText()}; ${BRANCH}`;
    }
    const context = this.#checker.getContextualType(node as ts.Expression);
    return context !== undefined && holdsString(context)
      ? `widens ${text} to string; ${BRANCH}`
      : undefined;
  }

  /**
   * True when a literal of another package's key sits where the compiler
   * types it as the owner's union: one side of a compare with a read, a case
   * of a switch on a read, a literal type, or a call argument.
   */
  isTypedKey(literal: ts.StringLiteralLike): boolean {
    let node: ts.Node = literal;
    while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
    const parent = node.parent;
    if (ts.isLiteralTypeNode(parent)) return true;
    if (ts.isBinaryExpression(parent) && isEquality(parent))
      return this.isRead(
        unwrap(parent.left === node ? parent.right : parent.left),
      );
    if (ts.isCaseClause(parent))
      return this.isRead(unwrap(parent.parent.parent.expression));
    if (ts.isCallExpression(parent) && parent.arguments.includes(literal)) {
      const context = this.#checker.getContextualType(literal);
      return context !== undefined && this.#keyOwners(context, 1) !== undefined;
    }
    return false;
  }
}

export interface EventVocabulary {
  readonly violations: readonly string[];
  /** Each event type the packages declare. */
  readonly events: number;
}

/** The violations of P1 for trace event types across `packages`. */
export function eventVocabulary(
  packages: readonly EventPackage[],
): EventVocabulary {
  const parsed: Parsed[] = packages.map((pkg) => ({
    name: pkg.name,
    exports: pkg.exports,
    sources: parse(pkg.files),
  }));
  const declared = declaredEvents(parsed);
  const keys = new Map<string, string[]>();
  for (const { name, key } of declared)
    keys.set(key, [...(keys.get(key) ?? []), name]);
  const violations: string[] = [];
  for (const { name, member, key } of declared) {
    const owners = keys.get(key) ?? [];
    if (owners.length > 1)
      violations.push(
        `${name} ${at(member)} declares event type ${key}, which ${list(owners)} declare; one package declares each event type`,
      );
  }
  const slashKeys = [...keys.keys()].filter((key) => key.includes('/'));
  const foreignKeys = (name: string) =>
    slashKeys.filter((key) => !keys.get(key)?.includes(name));
  const readers = parsed.filter((pkg) =>
    readsTrace(pkg, foreignKeys(pkg.name)),
  );
  if (readers.length === 0) return { violations, events: keys.size };

  // Every package's files under `/<package>/`, so they take no path of the
  // reader's own files, which keep their src/-relative names.
  const owners = new Map<ts.SourceFile, string>();
  const files = new Map<string, ts.SourceFile>();
  for (const pkg of parsed)
    for (const [path, file] of parse(
      [...pkg.sources.values()].map((source) => ({
        path: `/${pkg.name}/${source.fileName}`,
        source: source.text,
      })),
    )) {
      files.set(path, file);
      owners.set(file, pkg.name);
    }

  for (const reader of readers) {
    const entries = new Map<string, string>();
    for (const pkg of parsed)
      for (const [specifier, entry] of entriesOf(pkg))
        entries.set(
          specifier,
          pkg === reader ? entry : `/${pkg.name}/${entry}`,
        );
    const packages: Packages = { files, entries };
    const check = new Reader(
      reader.name,
      checkerOf(reader.sources, packages),
      keys,
      (file) =>
        reader.sources.get(file.fileName) === file
          ? reader.name
          : owners.get(file),
    );
    const foreign = new Set(foreignKeys(reader.name));
    const where = (node: ts.Node) => `${reader.name} ${at(node)}`;
    for (const [, node] of allNodes(reader.sources)) {
      if (ts.isStringLiteralLike(node) && foreign.has(node.text)) {
        if (!check.isTypedKey(node))
          violations.push(
            `${where(node)} names '${node.text}', an event type ${list(keys.get(node.text) ?? [])} declares; compare a typed read with it, or pass it where the owner's union types the argument`,
          );
        continue;
      }
      const candidate =
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node) ||
        (ts.isIdentifier(node) && check.isValueName(node));
      if (!candidate || !check.isForeignRead(node)) continue;
      const misuse = check.misuse(node);
      if (misuse !== undefined) violations.push(`${where(node)} ${misuse}`);
    }
  }
  return { violations, events: keys.size };
}
