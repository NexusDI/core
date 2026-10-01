import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

import ts from 'typescript';

/**
 * What a package's own declarations say about one export: its kind, its
 * docblock and its block tags.
 *
 * The compiler is the source. A reference page that restates a signature by
 * hand carries a second copy of it, and the copy is the one that goes stale
 * while reading as authoritative.
 *
 * Declarations are read from the package's `dist/`, through the `types`
 * condition of its own `exports` map, and not from `src/` through the
 * `@nexusdi/source` condition the workspace sets. The docs app already made
 * that choice for itself. `apps/docs/tsconfig.json` sets `customConditions:
 * []`, with a comment saying the site documents the published surface, and a
 * reference page documenting something a reader cannot install is worse than
 * one that cannot link to a line of source. `nx.json` orders the libraries'
 * builds ahead of the docs app's, so the declarations exist by the time this
 * runs.
 *
 * `commentText` and `internalMark` were written for
 * `tools/repo-checks/src/doc-export-coverage.test.ts` and moved here so that
 * the loader and the guard read a docblock the same way. That test imports
 * them from this module.
 */

/** A package resolved once, with its program and checker held for reuse. */
const programs = new Map();

/** An export, as the reference page needs it. */
const NAMING_TAGS = new Set([
  'param',
  'returns',
  'return',
  'default',
  'defaultvalue',
  'deprecated',
  'see',
  'throws',
]);

/**
 * A JSDoc comment as text. It arrives as a string, or as nodes once the block
 * carries an inline tag such as a `{@link}`.
 */
export function commentText(comment) {
  if (comment === undefined) return '';
  if (typeof comment === 'string') return comment;
  return comment.map((part) => part.text ?? '').join('');
}

/** A symbol's target when it is a re-export, and the symbol otherwise. */
export function resolveAlias(symbol, checker) {
  return symbol.getFlags() & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

/**
 * The prose of the docblock that marks a symbol `@internal`, or `null` when
 * nothing marks it.
 *
 * The tag is read off the declaration and its two enclosing nodes, because
 * which node carries it depends on how the name is exported. `export const x` puts it
 * on the `VariableStatement` two levels above the declaration, and
 * `export { x } from './x.js'` puts it on the `ExportDeclaration` two levels
 * above the specifier. An author writes the tag above the line either way.
 *
 * The prose returned is the comment of the block the tag sits in, not the
 * symbol's documentation. A re-export tagged `@internal` whose target carries a
 * long docblock about what the function does has still said nothing about why
 * it is not public API, and that sentence is the one being asked for.
 */
export function internalMark(symbol, resolved, checker) {
  const nodes = [
    ...(symbol.getDeclarations() ?? []),
    ...(resolved.getDeclarations() ?? []),
  ].flatMap((node) => [node, node.parent, node.parent?.parent]);

  for (const node of nodes) {
    if (!node) continue;
    for (const tag of ts.getJSDocTags(node)) {
      if (tag.tagName.text.toLowerCase() !== 'internal') continue;
      const block = tag.parent;
      return [commentText(block.comment), commentText(tag.comment)]
        .map((text) => text.trim())
        .filter(Boolean)
        .join(' ');
    }
  }

  // A tag the checker reports but no node carries, which happens for a symbol
  // whose declaration is in a file outside this program.
  const reported = [
    ...symbol.getJsDocTags(checker),
    ...resolved.getJsDocTags(checker),
  ].find((tag) => tag.name.toLowerCase() === 'internal');
  return reported ? ts.displayPartsToString(reported.text ?? []) : null;
}

/** Raised where a reference names something the compiler cannot find. */
export class DeclarationError extends Error {}

/**
 * The declaration file a specifier resolves to, and the directory of the
 * package that publishes it.
 *
 * Resolved through Node from the workspace root, so a package is found by the
 * name it publishes under and nothing here holds a list of packages.
 */
function entryOf(root, specifier) {
  const match = /^(@[^/]+\/[^/]+|[^@/][^/]*)(\/.*)?$/.exec(specifier);
  if (!match) {
    throw new DeclarationError(`'${specifier}' is not a package specifier`);
  }

  const [, name, subpath = ''] = match;
  const require_ = createRequire(join(root, 'index.js'));
  let manifestPath;
  try {
    manifestPath = require_.resolve(`${name}/package.json`);
  } catch {
    throw new DeclarationError(`no package named '${name}' is installed`);
  }

  const packageDir = dirname(manifestPath);
  const manifest = JSON.parse(ts.sys.readFile(manifestPath) ?? '{}');
  const target = (manifest.exports ?? {})[subpath === '' ? '.' : `.${subpath}`];
  const types =
    typeof target === 'string' ? target : (target?.types ?? target?.default);

  if (typeof types !== 'string') {
    throw new DeclarationError(
      `'${name}' publishes no '${subpath || '.'}' entry with declarations`,
    );
  }

  return { packageDir, declaration: join(packageDir, types) };
}

/** The program over one entry point, built once and kept. */
function programOf(root, specifier) {
  const held = programs.get(specifier);
  if (held) return held;

  const { packageDir, declaration } = entryOf(root, specifier);
  if (!ts.sys.fileExists(declaration)) {
    throw new DeclarationError(
      `'${specifier}' resolves to ${relative(root, declaration)}, which does ` +
        `not exist. The package has to be built before the docs app is.`,
    );
  }

  const program = ts.createProgram([declaration], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  });

  const built = {
    packageDir,
    declaration,
    program,
    checker: program.getTypeChecker(),
  };
  programs.set(specifier, built);
  return built;
}

/**
 * What an export is, from the kind of its first declaration.
 *
 * An error is its own kind, not a class, which the repository's own
 * export lists settle: 38 classes whose name ends `Error` against 4 that do
 * not, and every documented package carries an `errors.mdx`. A `const` holding
 * a function is a function, because what a reader does with it is call it.
 */
function kindOf(resolved, checker, at) {
  const declaration = resolved.getDeclarations()?.[0];
  if (!declaration) return 'constant';

  switch (declaration.kind) {
    case ts.SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case ts.SyntaxKind.TypeAliasDeclaration:
      return 'typeAlias';
    case ts.SyntaxKind.FunctionDeclaration:
      return 'function';
    case ts.SyntaxKind.ClassDeclaration:
      return resolved.getName().endsWith('Error') ? 'error' : 'class';
    default: {
      const type = checker.getTypeOfSymbolAtLocation(resolved, at);
      return type.getCallSignatures().length > 0 ? 'function' : 'constant';
    }
  }
}

const printer = ts.createPrinter({ removeComments: true });

/** The package a specifier names, with any subpath dropped. */
function packageNameOf(specifier) {
  const match = /^(@[^/]+\/[^/]+|[^@/][^/]*)/.exec(specifier);
  return match ? match[1] : specifier;
}

/** An entry point's exports, with whether each is importable as a value. */
function exportsOf(moduleSymbol, checker) {
  return new Map(
    checker.getExportsOfModule(moduleSymbol).map((each) => {
      const target = resolveAlias(each, checker);
      return [
        each.getName(),
        Boolean(target.getFlags() & ts.SymbolFlags.Value),
      ];
    }),
  );
}

/**
 * The program over an entry point, with its module symbol resolved too.
 *
 * Every caller of `programOf` goes on to ask the same two questions: which
 * source file the declaration parses to, and which symbol that file's own
 * module is. Resolving both here once keeps the two call sites, one reading
 * a second entry point's exports and one reading a named export, in step.
 */
function moduleOf(root, specifier) {
  const built = programOf(root, specifier);
  const source = built.program.getSourceFile(built.declaration);
  const moduleSymbol = source && built.checker.getSymbolAtLocation(source);
  return { ...built, source, moduleSymbol };
}

/** The same, for an entry point this call is not otherwise reading. */
function exportsOfSpecifier(root, specifier) {
  const { checker, moduleSymbol } = moduleOf(root, specifier);
  return moduleSymbol ? exportsOf(moduleSymbol, checker) : new Map();
}

/**
 * The declaration the package published, as source a Twoslash fence compiles.
 *
 * Printed from the `.d.ts`, not queried through Twoslash's `^?`. A
 * query renders as an overlay inside the `<pre>`, which cannot wrap: the
 * `hydratePolicy` signature is 154 characters on one line and the overlay
 * clips it. Printing also answers the two cases a query cannot. `^?` over an
 * interface's own name returns the name, so an interface entry would show its
 * identity and not its fields, and a query reports no constructor at all, so a
 * reader asking what to pass `new InvalidConditionError(...)` would get
 * nothing.
 *
 * A printed declaration names types the fence has to import or it will not
 * compile, so the names it mentions are intersected with the entry point's own
 * export list and imported. A type parameter is not an export, so `Sub` and
 * `Keys` fall out without being reasoned about. A declaration naming a type the
 * package does not publish fails `next build`, which is the right direction: a
 * reference entry a reader cannot type out is a reference entry that is wrong.
 *
 * `merges` decides whether the entry's own name carries its docblock.
 * Twoslash compiles the fence, so it answers about the symbol the fence
 * declares, and a redeclared symbol has no docblock because the comment
 * stayed in the source that was printed from. A reader hovering the name gets
 * a type and nothing else, which is the opposite of what a Twoslash fence is
 * for. Declaring the same name inside `declare module '<specifier>'` merges
 * with the published symbol and does not shadow it, so the hover answers for
 * the package and carries its documentation.
 *
 * Measured against `@nexusdi/core`, merging works for a function and an
 * interface, both of which TypeScript merges by design, and throws for a
 * class, a `const` and a type alias, none of which can be declared twice. So
 * those three keep the plain printed declaration and their own name's hover
 * shows a type with no prose. A type alias loses nothing by it: a printed alias
 * produces no hover on its own name either way. A class and a `const` do lose
 * the prose, and the entry carries it above the fence regardless, in the
 * summary and the disclosure, where the search index can also read it.
 */
function declarationOf(context, resolved, name, kind) {
  const { exported, root, packageDir, checker } = context;
  const declaration = resolved.getDeclarations()?.[0];
  if (!declaration) return null;

  // A `const` is declared inside a statement, and the statement is what
  // carries `declare` and the export modifier.
  const node = ts.isVariableDeclaration(declaration)
    ? declaration.parent.parent
    : declaration;
  const strip = (printed) =>
    printed.replace(/^export\s+/, '').replace(/^declare\s+/, '');
  const printed = printer.printNode(
    ts.EmitHint.Unspecified,
    node,
    node.getSourceFile(),
  );

  const merges = kind === 'function' || kind === 'interface';
  // Inside a module block the declaration is already ambient and already
  // exported, so the modifiers the `.d.ts` carries have to come off.
  const text = merges ? strip(printed) : printed;

  const own = new Set([name]);
  const values = [];
  const types = [];
  const fromRoot = [];
  const prelude = [];
  const seen = new Set();

  /**
   * Where each name the declaration mentions has to come from.
   *
   * Three answers and they are not interchangeable. A name the documented
   * entry point exports is imported from it. A name only the package root
   * exports is imported from there, which is what a second entry point needs:
   * `@nexusdi/core/testing` declares `assertAllowed(decision: Decision)` and
   * publishes no `Decision` of its own. A name the package declares and
   * publishes nowhere is printed into the fence above the cut, because a fence
   * that leaves it unbound does not fail; it silently binds to whatever
   * global has that name, and `Cond`'s `node: Node` bound to the DOM's `Node`
   * for as long as the entry existed.
   */
  const place = (each, from) => {
    if (seen.has(each)) return;
    seen.add(each);

    if (exported.has(each)) {
      (exported.get(each) ? values : types).push(each);
      return;
    }

    if (root.has(each)) {
      fromRoot.push(each);
      return;
    }

    // A name the checker resolves to a type declared inside the package is
    // private to it. Types only: a declaration's parameter names and property
    // names resolve too, and printing one puts `decision: Decision` at the top
    // of the fence as though it were a statement.
    const symbol = checker.resolveName(each, from, ts.SymbolFlags.Type, false);
    const target = symbol?.getDeclarations()?.[0];
    const standalone =
      target &&
      (ts.isInterfaceDeclaration(target) ||
        ts.isTypeAliasDeclaration(target) ||
        ts.isEnumDeclaration(target));

    if (
      !standalone ||
      !target.getSourceFile().fileName.startsWith(packageDir)
    ) {
      return;
    }

    const body = strip(
      printer.printNode(
        ts.EmitHint.Unspecified,
        target,
        target.getSourceFile(),
      ),
    );
    prelude.push(body);
    for (const mentioned of body.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      if (mentioned !== each) place(mentioned, target);
    }
  };

  for (const each of text.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    if (!own.has(each)) place(each, node);
  }

  return {
    text,
    merges,
    // The entry's own name is imported too when it merges, because importing
    // it is what puts the published symbol in the fence for the local one to
    // merge with.
    values: merges && exported.get(name) ? [name, ...values] : values,
    types: merges && !exported.get(name) ? [name, ...types] : types,
    fromRoot,
    prelude,
  };
}

/** Splits a docblock into its first paragraph and everything after it. */
function paragraphs(text) {
  const trimmed = text.trim().replace(/\r\n/g, '\n');
  const at = trimmed.indexOf('\n\n');
  if (at === -1) return { summary: trimmed, rest: '' };
  return {
    summary: trimmed.slice(0, at).trim(),
    rest: trimmed.slice(at).trim(),
  };
}

/**
 * One export, as a reference entry needs it.
 *
 * `readme` is workspace relative so that an example reference stays correct
 * when the page moves between directories.
 */
export function readReference(root, specifier, name) {
  const { packageDir, declaration, checker, source, moduleSymbol } = moduleOf(
    root,
    specifier,
  );

  if (!moduleSymbol) {
    throw new DeclarationError(`'${specifier}' exports nothing`);
  }

  // Every export of the entry point, with whether a caller can import it
  // without `import type`. The signature fence imports from this list, so the
  // package's own surface decides what a fence may name.
  const exported = exportsOf(moduleSymbol, checker);

  // The package root, when this is a second entry point. `@nexusdi/core/testing`
  // declares `assertAllowed(decision: Decision)` and publishes no `Decision`,
  // so a fence that imported only from `/testing` would not compile.
  const rootSpecifier = packageNameOf(specifier);
  const rootExports =
    rootSpecifier === specifier
      ? new Map()
      : exportsOfSpecifier(root, rootSpecifier);

  const symbol = checker
    .getExportsOfModule(moduleSymbol)
    .find((each) => each.getName() === name);

  if (!symbol) {
    throw new DeclarationError(`'${specifier}' does not export '${name}'`);
  }

  const resolved = resolveAlias(symbol, checker);
  const kind = kindOf(resolved, checker, source);
  const { summary, rest } = paragraphs(
    ts.displayPartsToString(resolved.getDocumentationComment(checker)),
  );

  const tags = resolved
    .getJsDocTags(checker)
    .filter((tag) => NAMING_TAGS.has(tag.name.toLowerCase()))
    .map((tag) => ({
      name: tag.name.toLowerCase(),
      text: ts.displayPartsToString(tag.text ?? []).trim(),
    }));

  return {
    name,
    specifier,
    kind,
    signature: declarationOf(
      { exported, root: rootExports, packageDir, checker },
      resolved,
      name,
      kind,
    ),
    rootSpecifier,
    summary,
    rest,
    tags,
    declaration,
    readme: relative(root, join(packageDir, 'README.md')).split('\\').join('/'),
  };
}
