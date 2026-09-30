import ts from 'typescript';

import type { SourceFileText } from './core-layers.js';
import { resolveRelative } from './entry-graph.js';

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
 * second parameter. `report` and `format` (reached as `x.format`,
 * `x['format']` or a binding of either) may only be called. Anything else
 * fails unless the policy names the site with a reason.
 */

/** One package's non-test sources, with paths relative to its src/. */
export interface PackageFiles {
  /** The package name the policy entries key on, such as `@nexusdi/testing`. */
  readonly name: string;
  readonly files: readonly SourceFileText[];
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

type Sources = ReadonlyMap<string, ts.SourceFile>;

function parse(files: readonly SourceFileText[]): Sources {
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

function allNodes(sources: Sources): [ts.SourceFile, ts.Node][] {
  return [...sources.values()].flatMap((sf) =>
    nodesOf(sf).map((node): [ts.SourceFile, ts.Node] => [sf, node]),
  );
}

function at(node: ts.Node): string {
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
function unwrap(expr: ts.Expression): ts.Expression {
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
 * The keys of each pack in the package's text module (`text.ts` or
 * `text/`): an object literal that satisfies, or is typed as,
 * `ErrorTextPack`.
 */
export function packCodes(files: readonly SourceFileText[]): string[] {
  const texts = files.filter(
    (file) => file.path === 'text.ts' || file.path.startsWith('text/'),
  );
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

/** A place `report` or `format` is used other than as a callee. */
interface PassedOn {
  readonly node: ts.Node;
  readonly name: 'report' | 'format';
}

/** A check hook the check cannot trace, with the text an allowance names. */
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
  kind: PassedOn['name'],
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
 * The function of an object literal member named `check`, or an Untraced
 * when the member's value is not a function the check can read.
 */
function checkHook(
  sources: Sources,
  node: ts.Node,
): FunctionNode | Untraced | undefined {
  if (!ts.isObjectLiteralElementLike(node) || nameOf(node.name) !== 'check')
    return undefined;
  if (!ts.isObjectLiteralExpression(node.parent)) return undefined;
  if (ts.isMethodDeclaration(node)) return node;
  const value = ts.isPropertyAssignment(node)
    ? node.initializer
    : ts.isShorthandPropertyAssignment(node)
      ? node.name
      : undefined;
  if (value === undefined) return undefined;
  const fn = functionOf(sources, value);
  if (fn !== undefined) return fn;
  const text = value.getText();
  return {
    node,
    argument: text,
    message: `${at(node)} sets check to ${text}, which is neither a function written there nor a package-local function; write the hook as one, or allowlist the site with a reason`,
  };
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
  for (const [, node] of allNodes(sources)) {
    // format through a member access: x.format(e), x['format'](e), or
    // x.format handed on as a value.
    if (isFormatAccess(node)) {
      const parent = node.parent;
      if (ts.isCallExpression(parent) && parent.expression === node)
        handoffs.push({ call: parent, verb: 'formats' });
      else if (!ts.isVariableDeclaration(parent))
        passedOn.push({ node, name: 'format' });
    }
    // format through a binding: const { format } = context, or
    // const format = context.format.
    const bound =
      (ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent) &&
        nameOf(node.propertyName ?? (node.name as ts.Identifier)) ===
          'format') ||
      (ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        isFormatAccess(unwrap(node.initializer)));
    if (bound) {
      const binding = node as ts.BindingElement | ts.VariableDeclaration;
      if (ts.isIdentifier(binding.name))
        usesOf(scopeOf(binding), binding.name, 'format', handoffs, passedOn);
      else passedOn.push({ node, name: 'format' });
    }
    const hook = checkHook(sources, node);
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
  return { handoffs, passedOn, untraced };
}

/**
 * The violations of spec section 2.5.1 in one package, and the policy
 * entries that excused one.
 */
export function textPlacement(
  pkg: PackageFiles,
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
  const packed = new Set(packCodes(pkg.files));
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
      `${at(node)} passes ${name} on as a value, and the check cannot follow it; call ${name} where it is bound, or allowlist the site with a reason`,
    );
  }
  for (const { node, argument, message } of untraced)
    excuse(siteAllowance(node, argument), message);
  return { violations, used };
}
