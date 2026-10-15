import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';

/**
 * The unexported `src` names a test case reaches, for the G11 rule that keeps
 * white-box cases off an export's rail (`doc-behaviour.test.ts`).
 *
 * A case reaches a name through any of five forms, and each one counts: a
 * named import (by its original name, so an alias hides nothing), a default
 * import (a package exports no name `default`, so a default from `src` is
 * always internal), a property or string key read off a namespace import, and
 * a dynamic `import('./…')`, destructured, read through, or bound to a name
 * the case then reads from. A dynamic import of `src` whose result the reader
 * cannot follow is reported by its specifier.
 *
 * Only an import whose path resolves inside the package's own `src` counts.
 * `test-support/` sits outside `src`, so a helper there may re-export an
 * internal name and a case that imports it through the helper passes. That
 * limit is deliberate: the helpers are shared fixtures, and a re-export there
 * is visible in one reviewed file.
 */

/** How a local name in the file reaches `src`. */
type Binding = { kind: 'named'; original: string } | { kind: 'namespace' };

const parse = (name: string, text: string): ts.SourceFile =>
  ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);

/** The specifier of `import('…')`, or undefined for any other node. */
function dynamicSpecifier(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return undefined;
  const [argument] = node.arguments;
  return argument && ts.isStringLiteralLike(argument)
    ? argument.text
    : undefined;
}

/** The node a dynamic import's value lands in, past `await` and parentheses. */
function landing(node: ts.Node): { outer: ts.Node; inner: ts.Node } {
  let inner = node;
  while (
    ts.isAwaitExpression(inner.parent) ||
    ts.isParenthesizedExpression(inner.parent)
  )
    inner = inner.parent;
  return { outer: inner.parent, inner };
}

/** The name `node` reads off `target`, as `target.name` or `target['name']`. */
function memberOf(node: ts.Node, target: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node) && node.expression === target)
    return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.expression === target &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return node.argumentExpression.text;
  return undefined;
}

/**
 * How the code around a dynamic import takes its value: destructured, with
 * each entry's local name and the name it reads, bound to one name, read
 * through by one member, or anything else.
 */
type Landing =
  | {
      kind: 'destructure';
      entries: { local: string | undefined; original: string }[];
    }
  | { kind: 'bound'; name: string }
  | { kind: 'member'; name: string }
  | { kind: 'other' };

function landingOf(call: ts.Node): Landing {
  const { outer, inner } = landing(call);
  if (ts.isVariableDeclaration(outer) && outer.initializer === inner) {
    if (ts.isObjectBindingPattern(outer.name))
      return {
        kind: 'destructure',
        entries: outer.name.elements.flatMap((element) => {
          const key = element.propertyName ?? element.name;
          if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return [];
          const local = ts.isIdentifier(element.name)
            ? element.name.text
            : undefined;
          return [{ local, original: key.text }];
        }),
      };
    if (ts.isIdentifier(outer.name))
      return { kind: 'bound', name: outer.name.text };
  }
  const member = memberOf(outer, inner);
  return member === undefined
    ? { kind: 'other' }
    : { kind: 'member', name: member };
}

export function whiteBoxNames(
  file: string,
  body: string,
  src: string,
  published: ReadonlySet<string>,
): string[] {
  const inSrc = (specifier: string): boolean =>
    specifier.startsWith('.') &&
    resolve(dirname(file), specifier).startsWith(src);

  const found: string[] = [];
  const report = (name: string): void => {
    if (!found.includes(name)) found.push(name);
  };
  const named = (original: string): void => {
    if (!published.has(original)) report(original);
  };

  const bindings = new Map<string, Binding>();

  /**
   * Where a dynamic import of `src` lands: destructured names are read at
   * once, a bound name becomes a namespace, and a property read off the value
   * is read at once. Anything else is reported by its specifier.
   */
  const followDynamic = (call: ts.Node, specifier: string): void => {
    const taken = landingOf(call);
    if (taken.kind === 'destructure')
      for (const { original } of taken.entries) named(original);
    else if (taken.kind === 'bound')
      bindings.set(taken.name, { kind: 'namespace' });
    else if (taken.kind === 'member') named(taken.name);
    else report(`import('${specifier}')`);
  };

  // The file's own imports, static and dynamic, at module scope.
  const source = parse(file, readFileSync(file, 'utf8'));
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (!inSrc(specifier)) continue;
      const clause = statement.importClause;
      if (clause.name)
        bindings.set(clause.name.text, { kind: 'named', original: 'default' });
      const inner = clause.namedBindings;
      if (inner && ts.isNamespaceImport(inner))
        bindings.set(inner.name.text, { kind: 'namespace' });
      if (inner && ts.isNamedImports(inner))
        for (const element of inner.elements)
          bindings.set(element.name.text, {
            kind: 'named',
            original: (element.propertyName ?? element.name).text,
          });
      continue;
    }
    const visit = (node: ts.Node): void => {
      const specifier = dynamicSpecifier(node);
      if (specifier !== undefined && inSrc(specifier)) {
        // A destructure at module scope is a named import in all but syntax:
        // the case reaches the names when it uses them.
        const taken = landingOf(node);
        if (taken.kind === 'destructure') {
          for (const { local, original } of taken.entries)
            if (local !== undefined)
              bindings.set(local, { kind: 'named', original });
          return;
        }
        if (taken.kind === 'bound') {
          bindings.set(taken.name, { kind: 'namespace' });
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }

  // The case: dynamic imports first, since one can bind a namespace the rest
  // of the case reads from, then every name and namespace read.
  const tree = parse('case.ts', body);
  const dynamics = (node: ts.Node): void => {
    const specifier = dynamicSpecifier(node);
    if (specifier !== undefined && inSrc(specifier))
      followDynamic(node, specifier);
    ts.forEachChild(node, dynamics);
  };
  dynamics(tree);

  const reads = (node: ts.Node): void => {
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      bindings.get(node.expression.text)?.kind === 'namespace'
    ) {
      const name = memberOf(node, node.expression);
      if (name !== undefined) {
        named(name);
        return;
      }
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isMember =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      const binding = bindings.get(node.text);
      if (!isMember && binding?.kind === 'named') named(binding.original);
    }
    ts.forEachChild(node, reads);
  };
  reads(tree);

  return found;
}
