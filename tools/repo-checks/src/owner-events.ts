import ts from 'typescript';

import { parse, type Sources } from './core-layers.js';
import { subpathEntryOf } from './entry-graph.js';
import {
  allNodes,
  at,
  isEquality,
  nameOf,
  type PackageFiles,
  unwrap,
} from './error-codes.js';
import { checkerOf, type Packages } from './type-checker.js';

/**
 * P1 for trace event types (spec section 1.2): a package reads another
 * package's event types only through the union the owner exports, and
 * copies none of them.
 *
 * The vocabulary is the keys of every `TraceEventByType` declaration: core's
 * interface and each augmentation, keyed `<package>/<event>`. The package
 * that declares a key owns it. The base declarations are `interface
 * TraceEventByType` outside a `declare module` block and the `TraceEvent`
 * alias in the same file.
 *
 * A trace read is one of these, resolved by a type checker over the package
 * and the packages it imports:
 * - a `type` property declared in the base `TraceEvent`
 * - a `TraceEventByType` field typed as a union of string literals
 * - a value or property whose declared type derives from a base declaration
 *   (`TraceEvent['type']`, `keyof TraceEventByType`, an alias of either, or a
 *   type parameter constrained to one) and holds only string literals
 * - a destructure of any of these, or an unannotated variable or object
 *   property bound to one
 *
 * A type that only spells event keys, such as a local `'init' | 'dispose'`,
 * is no read. A read of another package's vocabulary may be compared with
 * `===` or `!==` against a literal, a literal-typed value or another read,
 * switched on with a default clause, used as a key of a table the owner's
 * union types, or passed where the compiler types it as that union. A
 * string-keyed lookup, a text operation and a widening to `string`, `any` or
 * `unknown` fail. A rest parameter typed `any[]` or `unknown[]`, such as
 * `console.log`'s, takes a read as output, and so does a call the checker
 * cannot resolve.
 *
 * A table literal copies the vocabulary. Another package's `<package>/<event>`
 * key fails as any array element, property name or property value. A plain
 * word such as core's `init` fails in an array whose elements are all event
 * keys, as a quoted name in an object whose names all are, and as an
 * unquoted name in an object whose declared type names a base declaration.
 * A `<package>/<event>` literal also fails outside a compare with a read, a
 * case of a switch on a read, a literal type, a call argument whose
 * parameter type derives from a base declaration, and the initializer of a
 * variable declared with such a type.
 *
 * The check does not follow a read out of a callback's return value, so
 * `events.map((event) => event.type).join(',')` passes.
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
const FILL = 'fill a table from the events at run time';
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

/** True when `file` declares `interface TraceEventByType` at its top level. */
function declaresBase(file: ts.SourceFile): boolean {
  return file.statements.some(
    (statement) =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === BY_TYPE,
  );
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
 * event type, an observe hook or another package's key. The package that
 * declares the base `TraceEventByType` is core, which names no other
 * package (P3), so every event type it reads is its own.
 */
function readsTrace(pkg: Parsed, foreignKeys: readonly string[]): boolean {
  const sources = [...pkg.sources.values()];
  return (
    !sources.some(declaresBase) &&
    sources.some(
      (source) =>
        USES_TRACE.test(source.text) ||
        foreignKeys.some((key) => source.text.includes(key)),
    )
  );
}

const membersOf = (type: ts.Type): readonly ts.Type[] =>
  type.isUnion() ? type.types : [type];

/** The word a read widens to in `type`: `any`, `unknown`, `string`, or none. */
function widening(type: ts.Type | undefined): string | undefined {
  if (type === undefined) return undefined;
  if ((type.flags & ts.TypeFlags.Any) !== 0) return 'any';
  if ((type.flags & ts.TypeFlags.Unknown) !== 0) return 'unknown';
  return membersOf(type).some(
    (member) => (member.flags & ts.TypeFlags.String) !== 0,
  )
    ? 'string'
    : undefined;
}

/** `node` with every enclosing parenthesis climbed. */
function outermost(node: ts.Node): ts.Node {
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  return node;
}

/** The text of a string literal or a plain name, if `node` is one. */
function textOf(node: ts.Node): string | undefined {
  if (ts.isComputedPropertyName(node)) node = unwrap(node.expression);
  return ts.isStringLiteralLike(node) || ts.isIdentifier(node)
    ? node.text
    : undefined;
}

/**
 * The kind of table literal `literal`, another package's key, sits in: `an
 * array` or `an object`, or none. A `<package>/<event>` key counts as any
 * element, property name or property value. A plain word such as `run` or
 * `init` counts only in an array whose elements are all such keys, or as a
 * name in an object whose names all are, since a tooltip row `['run',
 * label]` or a step list `['compile', 'static']` holds the same words.
 */
function tableOf(
  literal: ts.StringLiteralLike,
  foreign: ReadonlySet<string>,
): string | undefined {
  const node = outermost(literal);
  const parent = node.parent;
  const named = literal.text.includes('/');
  if (ts.isArrayLiteralExpression(parent))
    return named ||
      parent.elements.every((element) => {
        const text = textOf(unwrap(element));
        return (
          ts.isStringLiteralLike(unwrap(element)) &&
          text !== undefined &&
          foreign.has(text)
        );
      })
      ? 'an array'
      : undefined;
  const property = ts.isComputedPropertyName(parent) ? parent.parent : parent;
  if (
    !ts.isPropertyAssignment(property) ||
    !ts.isObjectLiteralExpression(property.parent)
  )
    return undefined;
  if (named) return 'an object';
  return property.initializer !== node &&
    property.parent.properties.every((member) => {
      const text = member.name === undefined ? undefined : textOf(member.name);
      return text !== undefined && foreign.has(text);
    })
    ? 'an object'
    : undefined;
}

/** The type an object literal is declared with: an annotation, `as` or `satisfies`. */
function declaredTypeOf(
  object: ts.ObjectLiteralExpression,
): ts.TypeNode | undefined {
  const parent = outermost(object).parent;
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.initializer !== undefined
  )
    return parent.type;
  if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent))
    return parent.type;
  return undefined;
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

  /** The owner of a base declaration: core's `TraceEventByType` or `TraceEvent`. */
  #base(declaration: ts.Declaration): string | undefined {
    const file = declaration.getSourceFile();
    const base =
      (ts.isInterfaceDeclaration(declaration) &&
        declaration.name.text === BY_TYPE) ||
      (ts.isTypeAliasDeclaration(declaration) &&
        declaration.name.text === EVENT &&
        declaresBase(file));
    return base ? this.#ownerOfFile(file) : undefined;
  }

  /**
   * The owner of the base declaration `node` derives from: through
   * parentheses, unions, `keyof`, indexed access, type aliases and type
   * parameter constraints. Type arguments do not count, so
   * `Map<TraceEvent['type'], number>` derives from nothing.
   */
  #derived(
    node: ts.TypeNode | undefined,
    seen = new Set<ts.Node>(),
  ): string | undefined {
    if (node === undefined || seen.has(node)) return undefined;
    seen.add(node);
    if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node))
      return this.#derived(node.type, seen);
    if (ts.isIndexedAccessTypeNode(node))
      return this.#derived(node.objectType, seen);
    if (ts.isUnionTypeNode(node))
      for (const member of node.types) {
        const owner = this.#derived(member, seen);
        if (owner !== undefined) return owner;
      }
    if (!ts.isTypeReferenceNode(node)) return undefined;
    let symbol = this.#checker.getSymbolAtLocation(node.typeName);
    if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0)
      symbol = this.#checker.getAliasedSymbol(symbol);
    for (const declaration of symbol?.declarations ?? []) {
      const owner =
        this.#base(declaration) ??
        (ts.isTypeAliasDeclaration(declaration)
          ? this.#derived(declaration.type, seen)
          : ts.isTypeParameterDeclaration(declaration)
            ? this.#derived(declaration.constraint, seen)
            : undefined);
      if (owner !== undefined) return owner;
    }
    return undefined;
  }

  /** True when `node` names a base declaration anywhere, type arguments included. */
  #mentions(node: ts.TypeNode): boolean {
    const visit = (child: ts.Node): boolean =>
      (ts.isTypeReferenceNode(child) && this.#derived(child) !== undefined) ||
      ts.forEachChild(child, visit) === true;
    return visit(node);
  }

  /** The type of `node`, or its constraint when it is a type parameter. */
  #typeAt(node: ts.Node): ts.Type {
    const type = this.#checker.getTypeAtLocation(node);
    return (type.flags & ts.TypeFlags.TypeParameter) !== 0
      ? (this.#checker.getBaseConstraintOfType(type) ?? type)
      : type;
  }

  /** The declaration of the signature `call` resolves to, if the checker sees one. */
  #signatureOf(
    call: ts.CallExpression | ts.NewExpression,
  ): ts.SignatureDeclaration | undefined {
    const declaration = this.#checker.getResolvedSignature(call)?.declaration;
    return declaration === undefined || ts.isJSDocSignature(declaration)
      ? undefined
      : declaration;
  }

  /** True when the type of `node` holds only string literals, `null` and `undefined`. */
  #isLiteral(node: ts.Node): boolean {
    const members = membersOf(this.#typeAt(node)).filter(
      (member) =>
        (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0,
    );
    return (
      members.length > 0 && members.every((member) => member.isStringLiteral())
    );
  }

  /** The owners of the event types `node` holds, or `fallback` when it holds no key. */
  #ownersAt(node: ts.Node, fallback: string): Set<string> {
    const owners = new Set(
      membersOf(this.#typeAt(node)).flatMap((member) =>
        member.isStringLiteral() ? (this.#keys.get(member.value) ?? []) : [],
      ),
    );
    return owners.size > 0 ? owners : new Set([fallback]);
  }

  /** The owners a read of `symbol` at `node` reads, if it is a trace read. */
  #propertyOwners(
    symbol: ts.Symbol | undefined,
    node: ts.Node,
  ): ReadonlySet<string> | undefined {
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isPropertyAssignment(declaration))
        return this.#readOwners(unwrap(declaration.initializer));
      if (
        !ts.isPropertySignature(declaration) &&
        !ts.isPropertyDeclaration(declaration)
      )
        continue;
      let alias: ts.Node | undefined = declaration;
      while (alias !== undefined && !ts.isTypeAliasDeclaration(alias))
        alias = alias.parent;
      const base = alias === undefined ? undefined : this.#base(alias);
      if (symbol?.name === 'type' && base !== undefined)
        return this.#ownersAt(node, base);
      const entry = declaration.parent.parent;
      const owner = this.#ownerOfFile(declaration.getSourceFile());
      if (
        owner !== undefined &&
        ts.isTypeLiteralNode(declaration.parent) &&
        ts.isPropertySignature(entry) &&
        byTypeOf(entry)?.members.includes(entry) === true
      )
        return this.#isLiteral(node) ? new Set([owner]) : undefined;
      const derived = this.#derived(declaration.type);
      if (derived !== undefined && this.#isLiteral(node))
        return this.#ownersAt(node, derived);
    }
    return undefined;
  }

  #readOwners(node: ts.Node): ReadonlySet<string> | undefined {
    if (this.#reads.has(node)) return this.#reads.get(node);
    this.#reads.set(node, undefined);
    const owners = this.#declaredOwners(node);
    this.#reads.set(node, owners);
    return owners;
  }

  #declaredOwners(node: ts.Node): ReadonlySet<string> | undefined {
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
    if (declaration === undefined) return undefined;
    if (
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
    if (!ts.isVariableDeclaration(declaration) && !ts.isParameter(declaration))
      return undefined;
    if (declaration.type !== undefined) {
      const derived = this.#derived(declaration.type);
      return derived !== undefined && this.#isLiteral(node)
        ? this.#ownersAt(node, derived)
        : undefined;
    }
    return ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined
      ? this.#readOwners(unwrap(declaration.initializer))
      : undefined;
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

  /** True when an equality compares a read with a value the compiler types as literals. */
  #checked(other: ts.Expression): boolean {
    const node = unwrap(other);
    return (
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) && node.text === 'undefined') ||
      this.isRead(node) ||
      this.#isLiteral(node)
    );
  }

  /** True when `table` is opaque or has a string index signature. */
  #stringKeyed(table: ts.Expression): boolean {
    const type = this.#checker.getTypeAtLocation(table);
    return (
      (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
      this.#checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined
    );
  }

  /**
   * The parameter of `call` that `argument` fills: `output` for a rest
   * parameter typed `any[]` or `unknown[]`, `unseen` for a call the checker
   * cannot resolve.
   */
  #sink(
    call: ts.CallExpression | ts.NewExpression,
    argument: ts.Node,
  ): 'output' | 'unseen' | undefined {
    const declaration = this.#signatureOf(call);
    if (declaration === undefined) return 'unseen';
    const index = call.arguments?.indexOf(argument as ts.Expression) ?? -1;
    const last = declaration.parameters.at(-1);
    if (
      last?.dotDotDotToken === undefined ||
      index < declaration.parameters.length - 1
    )
      return undefined;
    const element = this.#checker.getIndexInfoOfType(
      this.#checker.getTypeAtLocation(last),
      ts.IndexKind.Number,
    )?.type;
    return element !== undefined &&
      (element.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0
      ? 'output'
      : undefined;
  }

  /** True when `node` sits, through object and array literals, in an argument of a call the checker cannot resolve. */
  #unseenArgument(node: ts.Node): boolean {
    let at = node;
    while (
      ts.isObjectLiteralExpression(at.parent) ||
      ts.isPropertyAssignment(at.parent) ||
      ts.isArrayLiteralExpression(at.parent) ||
      ts.isSpreadElement(at.parent) ||
      ts.isParenthesizedExpression(at.parent)
    )
      at = at.parent;
    const call = at.parent;
    return (
      (ts.isCallExpression(call) || ts.isNewExpression(call)) &&
      call.arguments?.includes(at as ts.Expression) === true &&
      this.#sink(call, at) === 'unseen'
    );
  }

  /**
   * The contextual type of `node`. A property value in an object literal
   * typed `any` or `unknown` has no contextual type of its own, so the
   * nearest enclosing object or array literal's stands in.
   */
  #contextOf(node: ts.Expression): ts.Type | undefined {
    const own = this.#checker.getContextualType(node);
    if (own !== undefined) return own;
    let at: ts.Node = node;
    while (
      ts.isPropertyAssignment(at.parent) ||
      ts.isObjectLiteralExpression(at.parent) ||
      ts.isArrayLiteralExpression(at.parent)
    ) {
      at = at.parent;
      if (ts.isObjectLiteralExpression(at) || ts.isArrayLiteralExpression(at)) {
        const context = this.#checker.getContextualType(at);
        if (context !== undefined)
          return (context.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !==
            0
            ? context
            : undefined;
      }
    }
    return undefined;
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
      if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
        const widened = widening(
          this.#checker.getTypeFromTypeNode(parent.type),
        );
        if (widened !== undefined)
          return `widens ${text} to ${widened}; ${BRANCH}`;
      }
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
        return this.#stringKeyed(parent.right)
          ? `looks up ${text} in ${parent.right.getText()}, a table keyed by string; ${BRANCH}`
          : undefined;
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
      return this.#stringKeyed(parent.expression)
        ? `looks up ${text} in ${parent.expression.getText()}, a table keyed by string; ${BRANCH}`
        : undefined;
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === node
    )
      return `reads the text of ${text} with ${parent.getText()}; ${BRANCH}`;
    if (ts.isTemplateSpan(parent))
      return `writes ${text} into a template literal; ${BRANCH}`;
    if (ts.isArrayLiteralExpression(parent)) {
      const array = outermost(parent);
      const access = array.parent;
      if (
        (ts.isPropertyAccessExpression(access) ||
          ts.isElementAccessExpression(access)) &&
        access.expression === array
      )
        return `reads the text of ${text} with ${access.getText()}; ${BRANCH}`;
    }
    if (
      ts.isComputedPropertyName(parent) &&
      ts.isObjectLiteralExpression(parent.parent.parent)
    ) {
      const context = this.#checker.getContextualType(parent.parent.parent);
      return context !== undefined &&
        ((context.flags &
          (ts.TypeFlags.Any |
            ts.TypeFlags.Unknown |
            ts.TypeFlags.NonPrimitive)) !==
          0 ||
          context.getProperties().length === 0)
        ? `uses ${text} as a key of an object typed ${this.#checker.typeToString(context)}; ${BRANCH}`
        : undefined;
    }
    if (
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.arguments?.includes(node as ts.Expression) === true &&
      this.#sink(parent, node) !== undefined
    )
      return undefined;
    const widened = widening(this.#contextOf(node as ts.Expression));
    if (widened === undefined) return undefined;
    return widened !== 'string' && this.#unseenArgument(node)
      ? undefined
      : `widens ${text} to ${widened}; ${BRANCH}`;
  }

  /**
   * True when a `<package>/<event>` literal sits where the compiler types it
   * as the owner's union: one side of a compare with a read, a case of a
   * switch on a read, a literal type, a call argument whose parameter type
   * derives from a base declaration, or the initializer of a variable
   * declared with such a type.
   */
  isTypedKey(literal: ts.StringLiteralLike): boolean {
    const node = outermost(literal);
    const parent = node.parent;
    if (ts.isLiteralTypeNode(parent)) return true;
    if (ts.isBinaryExpression(parent) && isEquality(parent))
      return this.isRead(
        unwrap(parent.left === node ? parent.right : parent.left),
      );
    if (ts.isCaseClause(parent))
      return this.isRead(unwrap(parent.parent.parent.expression));
    if (ts.isVariableDeclaration(parent) && parent.initializer === node)
      return this.#derived(parent.type) !== undefined;
    if (
      (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.arguments?.includes(node as ts.Expression) === true
    ) {
      const declaration = this.#signatureOf(parent);
      if (declaration === undefined) return false;
      const index = parent.arguments.indexOf(node as ts.Expression);
      const parameter =
        declaration.parameters[index] ?? declaration.parameters.at(-1);
      return this.#derived(parameter?.type) !== undefined;
    }
    return false;
  }

  /**
   * True when `name`, an unquoted property name, keys an object literal
   * whose declared type names a base declaration.
   */
  isTypedTableName(name: ts.Identifier): boolean {
    const property = name.parent;
    if (
      !(
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property) ||
        ts.isMethodDeclaration(property)
      ) ||
      property.name !== name ||
      !ts.isObjectLiteralExpression(property.parent)
    )
      return false;
    const declared = declaredTypeOf(property.parent);
    return declared !== undefined && this.#mentions(declared);
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
  const foreignKeys = (name: string) =>
    [...keys].flatMap(([key, owners]) => (owners.includes(name) ? [] : [key]));

  // Every package's files under `/<package>/`, so they take no path of the
  // reader's own files, which keep their src/-relative names. Built once a
  // first reader needs a checker.
  let files: Map<string, ts.SourceFile> | undefined;
  const owners = new Map<ts.SourceFile, string>();
  const virtual = (): Map<string, ts.SourceFile> => {
    if (files !== undefined) return files;
    files = new Map();
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
    return files;
  };

  for (const reader of parsed) {
    const foreign = new Set(foreignKeys(reader.name));
    const slashKeys = [...foreign].filter((key) => key.includes('/'));
    let check: Reader | undefined;
    if (readsTrace(reader, slashKeys)) {
      const entries = new Map<string, string>();
      for (const pkg of parsed)
        for (const [specifier, entry] of entriesOf(pkg))
          entries.set(
            specifier,
            pkg === reader ? entry : `/${pkg.name}/${entry}`,
          );
      const packages: Packages = { files: virtual(), entries };
      check = new Reader(
        reader.name,
        checkerOf(reader.sources, packages),
        keys,
        (file) =>
          reader.sources.get(file.fileName) === file
            ? reader.name
            : owners.get(file),
      );
    }
    const where = (node: ts.Node) => `${reader.name} ${at(node)}`;
    const owned = (key: string) =>
      `'${key}', an event type ${list(keys.get(key) ?? [])} declares`;
    for (const [, node] of allNodes(reader.sources)) {
      if (ts.isStringLiteralLike(node) && foreign.has(node.text)) {
        const table = tableOf(node, foreign);
        if (table !== undefined)
          violations.push(
            `${where(node)} writes ${owned(node.text)}, into ${table} literal; ${FILL}`,
          );
        else if (node.text.includes('/') && check?.isTypedKey(node) !== true)
          violations.push(
            `${where(node)} names ${owned(node.text)}; compare a typed read with it, or pass it where the owner's union types the argument`,
          );
        continue;
      }
      if (check === undefined) continue;
      if (
        ts.isIdentifier(node) &&
        foreign.has(node.text) &&
        check.isTypedTableName(node)
      ) {
        violations.push(
          `${where(node)} writes ${owned(node.text)}, into an object literal; ${FILL}`,
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
