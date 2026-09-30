import { dirname, join } from 'node:path';

import ts from 'typescript';

import { resolveRelative, type SourceFileText } from './core-layers.js';
import { subpathEntryOf, walkEntry } from './entry-graph.js';

/**
 * Where each error's text lives (spec section 2.5.1).
 *
 * A package declares its codes in `NexusErrorByCode`. Each code has a pack
 * entry in the package's `text.ts` or `text/`, or an inline raise site: a
 * `new X(fields, { text })` of an `errorBase` class. An error a
 * `compile.check` hook reports, or a plugin passes to `.format()`, takes its
 * text from the pack, so its raise site passes no `text`.
 *
 * The check reads source, so it fails closed. A reported or formatted
 * argument must be a `new X(...)` written at the call, or a call to a
 * package-local function whose every return is one. A `check` member must
 * be a function written there or a package-local function, with a named
 * second parameter. `report` and `format` (reached as `context.format`,
 * `context['format']` or a binding of either) may only be called.
 *
 * `format` counts only when it is read off a plugin context: the first
 * parameter of a `setup` member, followed through bindings, destructures,
 * object properties and package-local function parameters. A `setup` member
 * must be a function the check can read, with a named first parameter. A
 * context used any other way, such as passed to a function outside the
 * package, fails, since the check can no longer see its `format`. Anything
 * else fails unless the policy names the site with a reason.
 */

/** One package's non-test sources, with paths relative to its src/. */
export interface PackageFiles {
  /** The package name the policy entries key on, such as `@nexusdi/testing`. */
  readonly name: string;
  readonly files: readonly SourceFileText[];
}

/** A package's sources and its manifest's `exports`, which name its pack. */
export interface TextPackage extends PackageFiles {
  readonly exports: unknown;
}

/** Codes a package reports or formats with inline text (V9). */
export interface InlineTextAllowance {
  readonly package: string;
  readonly codes: readonly string[];
  readonly reason: string;
}

/** A code with no pack entry, because the errors engine renders its text. */
export interface EngineRendered {
  readonly package: string;
  readonly code: string;
  /** The class the engine tests with instanceof. */
  readonly errorClass: string;
  readonly reason: string;
}

/** A reported or formatted argument the check cannot trace. */
export interface SiteAllowance {
  readonly package: string;
  /** The file, relative to the package's src/. */
  readonly file: string;
  /** The argument's source text, such as `error`. */
  readonly argument: string;
  readonly reason: string;
}

export interface TextPolicy {
  readonly inlineText: readonly InlineTextAllowance[];
  readonly engineRendered: readonly EngineRendered[];
  readonly opaqueSites: readonly SiteAllowance[];
}

type PolicyEntry = InlineTextAllowance | EngineRendered | SiteAllowance;

export interface TextPlacement {
  readonly violations: readonly string[];
  /** The policy entries this package needed. */
  readonly used: ReadonlySet<PolicyEntry>;
}

/** Whether a raise site passes `text`, or passes options the check cannot read. */
type TextOption = 'inline' | 'none' | 'unread';

/** A `new X(...)` of an error. `code` is null when the check cannot tell it. */
interface RaiseSite {
  readonly at: string;
  readonly code: string | null;
  readonly text: TextOption;
}

export type Sources = ReadonlyMap<string, ts.SourceFile>;

export function parse(files: readonly SourceFileText[]): Sources {
  return new Map(
    files.map((file) => [
      file.path,
      ts.createSourceFile(file.path, file.source, ts.ScriptTarget.ESNext, true),
    ]),
  );
}

/** Every node under `root`, depth first. */
function nodesOf(root: ts.Node): ts.Node[] {
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
function nameOf(name: ts.PropertyName | undefined): string | undefined {
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
export function declaredCodes(files: readonly SourceFileText[]): string[] {
  const codes = allNodes(parse(files)).flatMap(([, node]) =>
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
export function packCodes(
  files: readonly SourceFileText[],
  exports: unknown,
): string[] {
  const entry = subpathEntryOf(exports, './text');
  if (typeof entry !== 'string') return [];
  const shipped = new Set<string>();
  for (const step of walkEntry(files, entry))
    if (step.kind === 'module') shipped.add(step.path);
  const texts = files.filter((file) => shipped.has(file.path));
  const codes = allNodes(parse(texts)).flatMap(([, node]) => {
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

/** The class names every `instanceof` in `files` tests against. */
export function instanceofClasses(files: readonly SourceFileText[]): string[] {
  const names = allNodes(parse(files)).flatMap(([, node]) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    ts.isIdentifier(node.right)
      ? [node.right.text]
      : [],
  );
  return [...new Set(names)].sort();
}

type Declaration =
  ts.ClassDeclaration | ts.FunctionDeclaration | ts.VariableDeclaration;

/**
 * The declaration `name` refers to in file `path`: a top-level class,
 * function or variable there, or one a relative import or re-export brings
 * in. Undefined for anything outside the package.
 */
function lookup(
  sources: Sources,
  path: string,
  name: string,
  depth = 0,
): Declaration | undefined {
  const sf = sources.get(path);
  if (sf === undefined || depth > 20) return undefined;
  const follow = (specifier: ts.Expression, imported: string) => {
    if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith('.'))
      return undefined;
    const target = resolveRelative(
      path,
      specifier.text,
      new Set(sources.keys()),
    );
    return target === null
      ? undefined
      : lookup(sources, target, imported, depth + 1);
  };
  for (const statement of sf.statements) {
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      statement.name?.text === name
    )
      return statement;
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(
        (d) => ts.isIdentifier(d.name) && d.name.text === name,
      );
      if (declaration !== undefined) return declaration;
    }
  }
  for (const statement of sf.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !(ts.isExportDeclaration(statement) && statement.moduleSpecifier)
    )
      continue;
    const specifier = statement.moduleSpecifier as ts.Expression;
    const named = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : statement.exportClause;
    // `export * from` passes every name through.
    if (named === undefined && ts.isExportDeclaration(statement)) {
      const found = follow(specifier, name);
      if (found !== undefined) return found;
      continue;
    }
    if (
      named === undefined ||
      !(ts.isNamedImports(named) || ts.isNamedExports(named))
    )
      continue;
    const elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[] =
      named.elements;
    const element = elements.find((e) => e.name.text === name);
    if (element !== undefined)
      return follow(specifier, (element.propertyName ?? element.name).text);
  }
  return undefined;
}

/**
 * The code an `errorBase` class raises: the literal it passes, 'fields' when
 * it reads the code from its fields, or undefined for another class.
 */
function errorBaseCode(
  declaration: Declaration | undefined,
): string | undefined {
  if (declaration === undefined || !ts.isClassDeclaration(declaration))
    return undefined;
  const heritage = declaration.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  )?.types[0]?.expression;
  if (
    heritage === undefined ||
    !ts.isCallExpression(heritage) ||
    !ts.isIdentifier(heritage.expression) ||
    heritage.expression.text !== 'errorBase'
  )
    return undefined;
  const code = heritage.arguments[0];
  return code !== undefined && ts.isStringLiteral(code) ? code.text : 'fields';
}

/** The `code` string a fields object literal names, or null. */
function codeInFields(fields: ts.Expression | undefined): string | null {
  if (fields === undefined) return null;
  fields = unwrap(fields);
  if (!ts.isObjectLiteralExpression(fields)) return null;
  for (const property of fields.properties)
    if (
      ts.isPropertyAssignment(property) &&
      nameOf(property.name) === 'code' &&
      ts.isStringLiteralLike(property.initializer)
    )
      return property.initializer.text;
  return null;
}

function textOption(options: ts.Expression | undefined): TextOption {
  if (options === undefined) return 'none';
  options = unwrap(options);
  if (!ts.isObjectLiteralExpression(options)) return 'unread';
  if (options.properties.some(ts.isSpreadAssignment)) return 'unread';
  return options.properties.some((p) => nameOf(p.name) === 'text')
    ? 'inline'
    : 'none';
}

/** A `new X(fields, options)`, with the code of X when X is an errorBase class. */
function raiseSite(sources: Sources, expr: ts.NewExpression): RaiseSite {
  const path = expr.getSourceFile().fileName;
  const code = ts.isIdentifier(expr.expression)
    ? errorBaseCode(lookup(sources, path, expr.expression.text))
    : undefined;
  return {
    at: at(expr),
    code:
      code === 'fields' ? codeInFields(expr.arguments?.[0]) : (code ?? null),
    text: textOption(expr.arguments?.[1]),
  };
}

/** The expressions a function returns, not counting nested functions. */
function returnsOf(fn: ts.SignatureDeclaration): ts.Expression[] {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (body === undefined) return [];
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression !== undefined)
      found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.MethodDeclaration;

/**
 * The function `value` is: one written there, or the package-local function
 * or function-valued variable an identifier names. Undefined otherwise.
 */
function functionOf(
  sources: Sources,
  value: ts.Expression,
): FunctionNode | undefined {
  const expr = unwrap(value);
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (!ts.isIdentifier(expr)) return undefined;
  const declaration = lookup(sources, expr.getSourceFile().fileName, expr.text);
  if (declaration === undefined) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
    return undefined;
  const initializer = unwrap(declaration.initializer);
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
    ? initializer
    : undefined;
}

/**
 * The raise sites a reported or formatted argument comes from: the
 * `new X(...)` itself, or every return of the package-local function it
 * calls. Null when the check cannot trace it.
 */
function sitesOf(
  sources: Sources,
  argument: ts.Expression | undefined,
): RaiseSite[] | null {
  if (argument === undefined) return null;
  const expr = unwrap(argument);
  if (ts.isNewExpression(expr)) return [raiseSite(sources, expr)];
  if (!ts.isCallExpression(expr)) return null;
  const fn = functionOf(sources, expr.expression);
  if (fn === undefined) return null;
  const returns = returnsOf(fn).map(unwrap);
  if (returns.length === 0 || !returns.every(ts.isNewExpression)) return null;
  return returns.map((ret) => raiseSite(sources, ret));
}

/** A `report(x)` in a check hook, or a call of a plugin context's `format`. */
interface Handoff {
  readonly call: ts.CallExpression;
  readonly verb: 'reports' | 'formats';
}

/**
 * A place `report`, `format` or a plugin context is used other than as the
 * check can follow.
 */
interface PassedOn {
  readonly node: ts.Node;
  readonly name: 'report' | 'format' | 'context';
}

/** A hook the check cannot trace, with the text an allowance names. */
interface Untraced {
  readonly node: ts.Node;
  readonly argument: string;
  readonly message: string;
}

/** True when `node` is a member access to `format`: `x.format` or `x['format']`. */
function isFormatAccess(node: ts.Node): boolean {
  return (
    (ts.isPropertyAccessExpression(node) && node.name.text === 'format') ||
    (ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'format')
  );
}

/** The function body or file a binding is visible in. */
function scopeOf(node: ts.Node): ts.Node {
  let at = node.parent;
  while (!ts.isSourceFile(at) && !ts.isFunctionLike(at)) at = at.parent;
  return at;
}

/** True when `node` names a property or declares a binding of its own. */
function isNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ((ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isParameter(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isBindingElement(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

/**
 * Each use of the binding `name` inside `scope`: a call is a handoff, any
 * other use passes the callable on.
 */
function usesOf(
  scope: ts.Node,
  name: ts.Identifier,
  kind: 'report' | 'format',
  handoffs: Handoff[],
  passedOn: PassedOn[],
): void {
  for (const use of nodesOf(scope)) {
    if (!ts.isIdentifier(use) || use === name || use.text !== name.text)
      continue;
    if (isNameOnly(use)) continue;
    const parent = use.parent;
    if (ts.isCallExpression(parent) && parent.expression === use)
      handoffs.push({
        call: parent,
        verb: kind === 'report' ? 'reports' : 'formats',
      });
    else passedOn.push({ node: use, name: kind });
  }
}

/**
 * True for an array literal or `Object.freeze` of one: a registry of hooks
 * held under a hook's key, which is never a hook itself.
 */
function isArrayValue(value: ts.Expression): boolean {
  const expr = unwrap(value);
  if (ts.isArrayLiteralExpression(expr)) return true;
  const [argument] = ts.isCallExpression(expr) ? expr.arguments : [];
  return (
    ts.isCallExpression(expr) &&
    expr.arguments.length === 1 &&
    argument !== undefined &&
    ts.isArrayLiteralExpression(unwrap(argument)) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    ts.isIdentifier(expr.expression.expression) &&
    expr.expression.expression.text === 'Object' &&
    expr.expression.name.text === 'freeze'
  );
}

/**
 * The function of an object literal member named `hook`, or an Untraced
 * when the member's value is not a function the check can read. `setup`
 * also counts as a member of a class.
 */
function pluginHook(
  sources: Sources,
  node: ts.Node,
  hook: 'check' | 'setup',
): FunctionNode | Untraced | undefined {
  const inClass =
    hook === 'setup' &&
    (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
    ts.isClassLike(node.parent);
  if (!inClass && !ts.isObjectLiteralElementLike(node)) return undefined;
  const member = node as ts.ObjectLiteralElementLike | ts.ClassElement;
  if (nameOf(member.name) !== hook) return undefined;
  if (!inClass && !ts.isObjectLiteralExpression(node.parent)) return undefined;
  if (ts.isMethodDeclaration(member)) return member;
  const value =
    ts.isPropertyAssignment(member) || ts.isPropertyDeclaration(member)
      ? member.initializer
      : ts.isShorthandPropertyAssignment(member)
        ? member.name
        : undefined;
  if (value === undefined || isArrayValue(value)) return undefined;
  const fn = functionOf(sources, value);
  if (fn !== undefined) return fn;
  const text = value.getText();
  return {
    node,
    argument: text,
    message: `${at(node)} sets ${hook} to ${text}, which is neither a function written there nor a package-local function; write the hook as one, or allowlist the site with a reason`,
  };
}

const LIB_DIR = dirname(ts.getDefaultLibFilePath({}));
const LIB = 'lib.es2022.d.ts';
const libFiles = new Map<string, ts.SourceFile | undefined>();

/** A default lib file, parsed once and shared by every package's checker. */
function libFile(name: string): ts.SourceFile | undefined {
  if (!libFiles.has(name)) {
    const text = ts.sys.readFile(name);
    libFiles.set(
      name,
      text === undefined
        ? undefined
        : ts.createSourceFile(name, text, ts.ScriptTarget.ESNext, true),
    );
  }
  return libFiles.get(name);
}

/**
 * A type checker over one package's sources and the es2022 lib. It
 * resolves local bindings, relative imports and lib types, and nothing
 * outside the package: another package's types are unresolved.
 */
function checkerOf(sources: Sources): ts.TypeChecker {
  const host: ts.CompilerHost = {
    getSourceFile: (name) =>
      name.startsWith(LIB_DIR) ? libFile(name) : sources.get(name),
    fileExists: (name) =>
      name.startsWith(LIB_DIR) ? ts.sys.fileExists(name) : sources.has(name),
    readFile: (name) =>
      name.startsWith(LIB_DIR)
        ? ts.sys.readFile(name)
        : sources.get(name)?.text,
    getDefaultLibFileName: () => join(LIB_DIR, LIB),
    getDefaultLibLocation: () => LIB_DIR,
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  return ts
    .createProgram({
      rootNames: [...sources.keys()],
      options: {
        lib: [LIB],
        noEmit: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      host,
    })
    .getTypeChecker();
}

/** Where a package's plugin contexts go. */
interface ContextFlow {
  /** Member reads off a context: `context.x` or `context['x']`. */
  readonly members: readonly (
    ts.PropertyAccessExpression | ts.ElementAccessExpression
  )[];
  /** Object destructures of a context. */
  readonly patterns: readonly ts.ObjectBindingPattern[];
  /** Uses the check cannot follow, where a context may leave its sight. */
  readonly escapes: readonly ts.Node[];
}

const PASS_THROUGH = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

const ASSIGNS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

/** Operators that read a value and yield something else. */
const TESTS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

/**
 * The outermost expression that carries `expr`'s value unchanged:
 * parentheses, casts, `!`, `??`, `||`, `&&` and a conditional's branches.
 */
function carrierOf(expr: ts.Expression): ts.Expression {
  for (;;) {
    const parent = expr.parent;
    const carries =
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      (ts.isBinaryExpression(parent) &&
        PASS_THROUGH.has(parent.operatorToken.kind)) ||
      (ts.isConditionalExpression(parent) && parent.condition !== expr);
    if (!carries) return expr;
    expr = parent;
  }
}

/** The name a member access reads, when it is written as a name or string. */
function memberName(expr: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (
    ts.isElementAccessExpression(expr) &&
    ts.isStringLiteralLike(expr.argumentExpression)
  )
    return expr.argumentExpression.text;
  return undefined;
}

/**
 * True when `node` sits in the target of a destructuring assignment, such
 * as `k` in `({ k } = h)`: a write, never a read.
 */
function inAssignmentPattern(node: ts.Node): boolean {
  let at = node;
  while (
    ts.isObjectLiteralExpression(at.parent) ||
    ts.isArrayLiteralExpression(at.parent) ||
    ts.isPropertyAssignment(at.parent) ||
    ts.isShorthandPropertyAssignment(at.parent) ||
    ts.isSpreadAssignment(at.parent) ||
    ts.isSpreadElement(at.parent) ||
    ts.isParenthesizedExpression(at.parent)
  ) {
    if (ts.isPropertyAssignment(at.parent) && at.parent.name === at)
      return false;
    at = at.parent;
  }
  const parent = at.parent;
  return (
    (ts.isBinaryExpression(parent) &&
      parent.left === at &&
      ASSIGNS.has(parent.operatorToken.kind)) ||
    ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) &&
      parent.initializer === at)
  );
}

/** What a tracked declaration holds: a context, or an object holding one. */
type Held = 'context' | 'holder';

/**
 * Follows the contexts that `seeds` (setup hooks' first parameters) receive
 * through the package. A context, or an object that holds one (a holder),
 * may be read, tested, bound, destructured, assigned, put in an object
 * literal property or passed to a package-local function. The check tracks
 * each by the declarations of the bindings and properties that hold it, so
 * a property read counts only when the checker resolves it to one of them,
 * or when a write it could not resolve used the same name. A holder may
 * also go to any place whose type declares its tracked properties in the
 * package. Every other use escapes.
 */
function contextFlow(
  sources: Sources,
  seeds: readonly ts.ParameterDeclaration[],
): ContextFlow {
  const checker = checkerOf(sources);
  const held = new Map<ts.Node, Held>();
  /** Property names written where the checker resolved no property. */
  const names = new Map<string, Held>();
  const members = new Set<
    ts.PropertyAccessExpression | ts.ElementAccessExpression
  >();
  const patterns = new Set<ts.ObjectBindingPattern>();
  const escapes = new Set<ts.Node>();
  const local = (node: ts.Node) =>
    sources.get(node.getSourceFile().fileName) === node.getSourceFile();
  const resolved = (symbol: ts.Symbol | undefined) =>
    symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const heldBy = (symbol: ts.Symbol | undefined): Held | undefined => {
    for (const declaration of symbol?.declarations ?? []) {
      const kind = held.get(declaration);
      if (kind !== undefined) return kind;
    }
    return undefined;
  };
  const track = (symbol: ts.Symbol | undefined, kind: Held, site: ts.Node) => {
    const declarations = symbol?.declarations ?? [];
    if (declarations.length === 0 || !declarations.every(local))
      return void escapes.add(site);
    for (const declaration of declarations)
      if (held.get(declaration) !== 'context') held.set(declaration, kind);
  };
  /** The tracked properties of `type`, each with what it holds. */
  const trackedProperties = (type: ts.Type): [string, Held][] => {
    const found = new Map<string, Held>();
    const types = type.isUnion() ? type.types : [type];
    for (const each of types)
      for (const property of each.getProperties()) {
        const kind = heldBy(property) ?? names.get(property.name);
        if (kind !== undefined) found.set(property.name, kind);
      }
    return [...found];
  };
  /**
   * Moves a holder of type `from` to a place of type `to`: each tracked
   * property must exist on `to`, declared in the package.
   */
  const transfer = (from: ts.Type, to: ts.Type | undefined, site: ts.Node) => {
    for (const [name, kind] of trackedProperties(from)) {
      const target =
        to === undefined || to.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)
          ? undefined
          : checker.getNonNullableType(to).getProperty(name);
      track(target, kind, site);
    }
  };
  /** Binds `name` to a value of kind `kind` and type `type`. */
  const bind = (
    name: ts.BindingName,
    kind: Held,
    type: ts.Type,
    site: ts.Node,
  ): void => {
    if (ts.isIdentifier(name)) {
      const symbol = resolved(checker.getSymbolAtLocation(name));
      track(symbol, kind, site);
      if (kind === 'holder')
        transfer(type, checker.getTypeAtLocation(name), site);
      return;
    }
    if (ts.isArrayBindingPattern(name)) return void escapes.add(site);
    if (kind === 'context') patterns.add(name);
    for (const element of name.elements) {
      const key = nameOf(
        element.propertyName ?? (element.name as ts.Identifier),
      );
      if (element.dotDotDotToken !== undefined) {
        bind(element.name, kind, checker.getTypeAtLocation(element.name), site);
        continue;
      }
      if (key === undefined) {
        escapes.add(element);
        continue;
      }
      if (kind === 'context') continue;
      const property = checker.getNonNullableType(type).getProperty(key);
      const inner = property && (heldBy(property) ?? names.get(key));
      if (property !== undefined && inner !== undefined)
        bind(
          element.name,
          inner,
          checker.getTypeOfSymbolAtLocation(property, element),
          element,
        );
    }
  };
  /** An assignment of a value of kind `kind` and type `type` to `target`. */
  const assign = (
    target: ts.Expression,
    kind: Held,
    type: ts.Type,
    site: ts.Node,
  ): void => {
    target = unwrap(target);
    if (ts.isIdentifier(target)) {
      track(resolved(checker.getSymbolAtLocation(target)), kind, site);
      if (kind === 'holder')
        transfer(type, checker.getTypeAtLocation(target), site);
      return;
    }
    const name = memberName(target);
    if (name !== undefined) {
      const key = ts.isPropertyAccessExpression(target)
        ? target.name
        : (target as ts.ElementAccessExpression).argumentExpression;
      const symbol = resolved(checker.getSymbolAtLocation(key));
      if (symbol === undefined) {
        if (names.get(name) !== 'context') names.set(name, kind);
        return;
      }
      const setter = symbol.declarations?.find(ts.isSetAccessorDeclaration);
      const [parameter] = setter?.parameters ?? [];
      if (setter !== undefined && parameter !== undefined && local(setter))
        return bind(parameter.name, kind, type, site);
      if (symbol.flags & ts.SymbolFlags.Accessor) return void escapes.add(site);
      track(symbol, kind, site);
      if (kind === 'holder')
        transfer(type, checker.getTypeOfSymbolAtLocation(symbol, key), site);
      return;
    }
    // A destructuring assignment of a holder: ({ a: k } = h).
    if (kind === 'holder' && ts.isObjectLiteralExpression(target)) {
      for (const element of target.properties) {
        if (ts.isSpreadAssignment(element)) {
          escapes.add(element);
          continue;
        }
        const key = nameOf(element.name);
        if (key === undefined) {
          escapes.add(element);
          continue;
        }
        const property = checker.getNonNullableType(type).getProperty(key);
        const inner = property && (heldBy(property) ?? names.get(key));
        if (property === undefined || inner === undefined) continue;
        const value = checker.getTypeOfSymbolAtLocation(property, element);
        if (ts.isShorthandPropertyAssignment(element))
          track(
            resolved(checker.getShorthandAssignmentValueSymbol(element)),
            inner,
            element,
          );
        else if (ts.isPropertyAssignment(element))
          assign(element.initializer, inner, value, element);
        else escapes.add(element);
      }
      return;
    }
    escapes.add(site);
  };
  /** What `node` holds, when it reads a tracked binding, property or literal. */
  const reference = (node: ts.Node): Held | undefined => {
    if (ts.isObjectLiteralExpression(node))
      return !inAssignmentPattern(node) &&
        node.properties.some((property) => held.has(property))
        ? 'holder'
        : undefined;
    // `this` in a class whose fields hold a context.
    if (node.kind === ts.SyntaxKind.ThisKeyword)
      return trackedProperties(checker.getTypeAtLocation(node)).length > 0
        ? 'holder'
        : undefined;
    let symbol: ts.Symbol | undefined;
    let name: string | undefined;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      if (
        isNameOnly(node) ||
        ts.isImportClause(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isNamespaceImport(parent) ||
        (!ts.isShorthandPropertyAssignment(parent) &&
          (parent as ts.NamedDeclaration).name === node) ||
        inAssignmentPattern(node)
      )
        return undefined;
      symbol = resolved(
        ts.isShorthandPropertyAssignment(parent)
          ? checker.getShorthandAssignmentValueSymbol(parent)
          : checker.getSymbolAtLocation(node),
      );
      if (symbol === undefined) return undefined;
    } else if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      name = memberName(node);
      if (name === undefined || inAssignmentPattern(node)) return undefined;
      const key = ts.isPropertyAccessExpression(node)
        ? node.name
        : node.argumentExpression;
      symbol = resolved(checker.getSymbolAtLocation(key));
    } else return undefined;
    const kind =
      heldBy(symbol) ?? (name === undefined ? undefined : names.get(name));
    if (kind !== undefined) return kind;
    if (symbol === undefined) return undefined;
    if (!(symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Property)))
      return undefined;
    return trackedProperties(checker.getTypeAtLocation(node)).length > 0
      ? 'holder'
      : undefined;
  };
  const follow = (reference: ts.Expression, kind: Held): void => {
    const expr = carrierOf(reference);
    const parent = expr.parent;
    const type = checker.getTypeAtLocation(expr);
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === expr
    ) {
      if (memberName(parent) === undefined) escapes.add(parent);
      else if (kind === 'context') members.add(parent);
      return;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === expr)
      return bind(parent.name, kind, type, parent);
    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;
      if (parent.left === expr && ASSIGNS.has(operator)) return;
      if (parent.right === expr && ASSIGNS.has(operator))
        return assign(parent.left, kind, type, expr);
      if (
        TESTS.has(operator) ||
        (operator === ts.SyntaxKind.CommaToken && parent.left === expr)
      )
        return;
    }
    if (
      ts.isExpressionStatement(parent) ||
      ts.isTypeOfExpression(parent) ||
      ts.isVoidExpression(parent) ||
      (ts.isPrefixUnaryExpression(parent) &&
        parent.operator === ts.SyntaxKind.ExclamationToken) ||
      ((ts.isIfStatement(parent) ||
        ts.isWhileStatement(parent) ||
        ts.isDoStatement(parent)) &&
        parent.expression === expr) ||
      ((ts.isForStatement(parent) || ts.isConditionalExpression(parent)) &&
        parent.condition === expr)
    )
      return;
    // Into an object literal property: the literal becomes a holder.
    if (
      (ts.isShorthandPropertyAssignment(parent) ||
        (ts.isPropertyAssignment(parent) && parent.initializer === expr)) &&
      nameOf(parent.name) !== undefined
    ) {
      if (held.get(parent) !== 'context') held.set(parent, kind);
      return;
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(expr)) {
      const index = parent.arguments.indexOf(expr);
      const parameter = functionOf(sources, parent.expression)?.parameters[
        index
      ];
      if (
        parameter !== undefined &&
        parameter.dotDotDotToken === undefined &&
        !parent.arguments.slice(0, index).some(ts.isSpreadElement)
      )
        return bind(parameter.name, kind, type, expr);
      // A holder may go where the parameter's type declares its tracked
      // properties in the package, as a WeakMap's value type does.
      if (kind === 'holder')
        return transfer(type, checker.getContextualType(expr), expr);
    }
    escapes.add(expr);
  };

  for (const seed of seeds)
    bind(seed.name, 'context', checker.getTypeAtLocation(seed), seed);
  const nodes = allNodes(sources).map(([, node]) => node);
  let known = -1;
  while (known !== held.size + names.size) {
    known = held.size + names.size;
    for (const node of nodes) {
      const kind = reference(node);
      if (kind !== undefined) follow(node as ts.Expression, kind);
    }
  }
  return {
    members: [...members],
    patterns: [...patterns],
    escapes: [...escapes],
  };
}

/** Source order: by file, then by position. */
function bySource(a: ts.Node, b: ts.Node): number {
  const files = a
    .getSourceFile()
    .fileName.localeCompare(b.getSourceFile().fileName);
  return files !== 0 ? files : a.getStart() - b.getStart();
}

/**
 * The format handoffs of a package's plugin contexts. `format` counts only
 * when it is read off a context the check follows from a setup hook; a
 * context it loses sight of is passed on.
 */
function formatHandoffs(
  sources: Sources,
  seeds: readonly ts.ParameterDeclaration[],
  handoffs: Handoff[],
  passedOn: PassedOn[],
): void {
  if (seeds.length === 0) return;
  const { members, patterns, escapes } = contextFlow(sources, seeds);
  for (const node of escapes) passedOn.push({ node, name: 'context' });
  // format through a member access: context.format(e),
  // context['format'](e), const format = context.format, or format handed
  // on as a value.
  for (const access of members.filter(isFormatAccess)) {
    let expr: ts.Expression = access;
    while (
      ts.isParenthesizedExpression(expr.parent) ||
      ts.isAsExpression(expr.parent) ||
      ts.isSatisfiesExpression(expr.parent) ||
      ts.isNonNullExpression(expr.parent)
    )
      expr = expr.parent;
    const parent = expr.parent;
    if (ts.isCallExpression(parent) && parent.expression === expr)
      handoffs.push({ call: parent, verb: 'formats' });
    else if (
      ts.isVariableDeclaration(parent) &&
      parent.initializer === expr &&
      ts.isIdentifier(parent.name)
    )
      usesOf(scopeOf(parent), parent.name, 'format', handoffs, passedOn);
    else passedOn.push({ node: access, name: 'format' });
  }
  // format through a destructure: const { format } = context.
  for (const pattern of patterns)
    for (const element of pattern.elements) {
      if (
        element.dotDotDotToken !== undefined ||
        nameOf(element.propertyName ?? (element.name as ts.Identifier)) !==
          'format'
      )
        continue;
      if (ts.isIdentifier(element.name))
        usesOf(scopeOf(element), element.name, 'format', handoffs, passedOn);
      else passedOn.push({ node: element, name: 'format' });
    }
}

function handoffsOf(sources: Sources): {
  handoffs: Handoff[];
  passedOn: PassedOn[];
  untraced: Untraced[];
} {
  const handoffs: Handoff[] = [];
  const passedOn: PassedOn[] = [];
  const untraced: Untraced[] = [];
  const hooks = new Set<FunctionNode>();
  const seeds = new Set<ts.ParameterDeclaration>();
  for (const [, node] of allNodes(sources)) {
    const setup = pluginHook(sources, node, 'setup');
    if (setup !== undefined && !('parameters' in setup)) untraced.push(setup);
    else if (setup !== undefined) {
      const [context] = setup.parameters;
      if (context?.dotDotDotToken !== undefined) {
        const text = context.getText();
        untraced.push({
          node: setup,
          argument: text,
          message: `${at(setup)} takes the plugin context as ${text}, which the check cannot follow; name the first parameter, or allowlist the site with a reason`,
        });
      } else if (context !== undefined) seeds.add(context);
    }
    const hook = pluginHook(sources, node, 'check');
    if (hook === undefined) continue;
    if (!('parameters' in hook)) {
      untraced.push(hook);
      continue;
    }
    if (hooks.has(hook)) continue;
    hooks.add(hook);
    const [first, report] = hook.parameters;
    // A rest parameter, or a destructured second one, hides report's name.
    const hidden = [first, report].find(
      (p) =>
        p !== undefined &&
        (p.dotDotDotToken !== undefined ||
          (p === report && !ts.isIdentifier(p.name))),
    );
    if (hidden !== undefined) {
      const text = hidden.getText();
      untraced.push({
        node: hook,
        argument: text,
        message: `${at(hook)} takes report as ${text}, which the check cannot follow; name the second parameter, or allowlist the site with a reason`,
      });
      continue;
    }
    if (report !== undefined && ts.isIdentifier(report.name))
      usesOf(hook, report.name, 'report', handoffs, passedOn);
  }
  formatHandoffs(sources, [...seeds], handoffs, passedOn);
  handoffs.sort((a, b) => bySource(a.call, b.call));
  passedOn.sort((a, b) => bySource(a.node, b.node));
  untraced.sort((a, b) => bySource(a.node, b.node));
  return { handoffs, passedOn, untraced };
}

/**
 * The violations of spec section 2.5.1 in one package, and the policy
 * entries that excused one.
 */
export function textPlacement(
  pkg: TextPackage,
  policy: TextPolicy,
): TextPlacement {
  const sources = parse(pkg.files);
  const violations: string[] = [];
  const used = new Set<PolicyEntry>();
  const mine = <E extends PolicyEntry>(entries: readonly E[]) =>
    entries.filter((entry) => entry.package === pkg.name);
  const siteAllowance = (node: ts.Node, argument: string) =>
    mine(policy.opaqueSites).find(
      (site) =>
        site.file === node.getSourceFile().fileName &&
        site.argument === argument,
    );
  const excuse = (entry: PolicyEntry | undefined, message: string) => {
    if (entry === undefined) violations.push(message);
    else used.add(entry);
  };

  // Case 1: every declared code has a pack entry or an inline raise site.
  const packed = new Set(packCodes(pkg.files, pkg.exports));
  const inline = new Set(
    allNodes(sources).flatMap(([, node]) => {
      if (!ts.isNewExpression(node)) return [];
      const site = raiseSite(sources, node);
      return site.text === 'inline' && site.code !== null ? [site.code] : [];
    }),
  );
  for (const code of declaredCodes(pkg.files)) {
    if (packed.has(code) || inline.has(code)) continue;
    excuse(
      mine(policy.engineRendered).find((entry) => entry.code === code),
      `${pkg.name} declares ${code}, and it has neither a pack entry nor an inline raise site`,
    );
  }

  // Case 2: a reported or formatted error takes its text from the pack.
  const { handoffs, passedOn, untraced } = handoffsOf(sources);
  for (const { call, verb } of handoffs) {
    const argument = call.arguments[0];
    const text = argument?.getText() ?? '';
    const sites = sitesOf(sources, argument);
    if (sites === null) {
      excuse(
        siteAllowance(call, text),
        `${at(call)} ${verb} ${text}, which is neither a new expression nor a call to a package-local factory that returns one; build the error there, or allowlist the site with a reason`,
      );
      continue;
    }
    for (const site of sites) {
      const code = site.code ?? 'an error';
      if (site.text === 'unread')
        excuse(
          siteAllowance(call, text),
          `${at(call)} ${verb} ${code}, built at ${site.at} with options the check cannot read; pass an object literal, or allowlist the site with a reason`,
        );
      if (site.text === 'inline')
        excuse(
          mine(policy.inlineText).find(
            (entry) => site.code !== null && entry.codes.includes(site.code),
          ),
          `${at(call)} ${verb} ${code}, built with inline text at ${site.at}; reported and formatted errors take their text from the pack`,
        );
    }
  }
  for (const { node, name } of passedOn) {
    const argument = ts.isCallExpression(node.parent)
      ? node.parent.getText()
      : node.getText();
    excuse(
      siteAllowance(node, argument),
      name === 'context'
        ? `${at(node)} passes the plugin context on as a value, and the check cannot follow it to its format calls; keep it in a binding or property the check can trace, or allowlist the site with a reason`
        : `${at(node)} passes ${name} on as a value, and the check cannot follow it; call ${name} where it is bound, or allowlist the site with a reason`,
    );
  }
  for (const { node, argument, message } of untraced)
    excuse(siteAllowance(node, argument), message);
  return { violations, used };
}
