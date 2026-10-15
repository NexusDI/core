import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

import ts from 'typescript';

import { examplesFilesIn } from './examples-file.mjs';

/**
 * What a package's own declarations say about one export: its kind, its
 * docblock and its block tags.
 *
 * The compiler is the source. A reference page that restates a signature by
 * hand carries a second copy of it, and the copy is the one that goes stale
 * while reading as authoritative.
 *
 * Declarations are read from the package's `dist/`, through the `types`
 * condition of its own `exports` map. The `@nexusdi/source` condition the
 * workspace sets would point at `src/`, and the docs app already declined it:
 * `apps/docs/tsconfig.json` sets `customConditions: []`, with a comment saying
 * the site documents the published surface, and a reference page documenting
 * something a reader cannot install is worse than one that cannot link to a
 * line of source. `nx.json` orders the libraries' builds ahead of the docs
 * app's, so the declarations exist by the time this runs.
 *
 * `commentText` and `internalMark` were written for
 * `tools/repo-checks/src/doc-export-coverage.test.ts` and moved here so that
 * the loader and the guard read a docblock the same way. That test imports
 * them from this module.
 */

/**
 * A package resolved once, with its program and checker held for reuse.
 *
 * Keyed by the root as well as the specifier. One process can read the same
 * specifier under two roots (a test's fixture root and the workspace), and a
 * program built for one root answers nothing about the other.
 */
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
 * which node carries it depends on how the name is exported. `export const x`
 * puts it on the `VariableStatement` two levels above the declaration, and
 * `export { x } from './x.js'` puts it on the `ExportDeclaration` two levels
 * above the specifier. An author writes the tag above the line either way.
 *
 * The prose returned is the comment of the block the tag sits in, which may
 * differ from the symbol's documentation. A re-export tagged `@internal` whose
 * target carries a long docblock about what the function does has still said
 * nothing about why it is not public API, and that sentence is the one being
 * asked for.
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
  const key = `${root}\0${specifier}`;
  const held = programs.get(key);
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
  programs.set(key, built);
  return built;
}

/**
 * What an export is, from the kind of its first declaration.
 *
 * An error is its own kind and no class. A reader catches an exported class
 * whose name ends `Error` and looks it up by its code, and builds with the
 * others (`Token`, `MultiToken`, `Nexus`). A `const` holding a function is a
 * function, because what a reader does with it is call it.
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

/** `text` as a regular expression that matches it literally. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The package a specifier names, with any subpath dropped. */
function packageNameOf(specifier) {
  const match = /^(@[^/]+\/[^/]+|[^@/][^/]*)/.exec(specifier);
  return match ? match[1] : specifier;
}

/**
 * The package a declaration file imports a name from, or `null`.
 *
 * A published `.d.ts` states where every name it did not declare comes from:
 * `libs/devtools/dist/devtools.d.ts` opens with
 * `import { type ErrorTextPack, type Nexus, … } from '@nexusdi/core'`. A fence
 * naming one of those without that line binds it to nothing, so the fence
 * repeats the line the file already wrote.
 *
 * A relative specifier gives `null`. It names a module inside the package,
 * which a reader's fence cannot resolve, and the prelude branch of `place`
 * prints a type declared there into the fence.
 */
function importedFrom(name, node) {
  for (const statement of node.getSourceFile().statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if (!bindings.elements.some((element) => element.name.text === name)) {
      continue;
    }

    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) return null;

    return /^[./]/.test(specifier.text) ? null : specifier.text;
  }

  return null;
}

/** The package a file sits in: its directory and the name it publishes. */
const owners = new Map();
function ownerOf(file) {
  let dir = dirname(file);
  while (dir !== dirname(dir)) {
    if (owners.has(dir)) return owners.get(dir);
    const manifest = join(dir, 'package.json');
    if (ts.sys.fileExists(manifest)) {
      const name = JSON.parse(ts.sys.readFile(manifest) ?? '{}').name;
      const owner = typeof name === 'string' ? { dir, name } : null;
      owners.set(dir, owner);
      return owner;
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * The first-party package a file belongs to, or `null` for a file under
 * `node_modules` or outside every package. A workspace package resolves
 * through its own directory (`libs/core/dist/…`), so the path is enough.
 */
function firstParty(file) {
  if (file.split(/[\\/]/).includes('node_modules')) return null;
  return ownerOf(file);
}

/** A package's root exports, or none when it has no declarations entry. */
const packageExports = new Map();
function exportsOfPackage(workspace, name) {
  const key = `${workspace}\0${name}`;
  if (!packageExports.has(key)) {
    let found = new Map();
    try {
      found = exportsOfSpecifier(workspace, name);
    } catch {
      // A package with no declarations entry exports nothing a fence imports.
    }
    packageExports.set(key, found);
  }
  return packageExports.get(key);
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
 * module is. This helper resolves both once, so the two call sites, one reading
 * a second entry point's exports and one reading a named export, stay in
 * step.
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
 * Printed from the `.d.ts`, with no query through Twoslash's `^?`. A query
 * renders as an overlay inside the `<pre>`, which cannot wrap: the
 * `errorBase` signature is 210 characters on one line and the overlay clips
 * it. The printed form also answers the two cases a query cannot. `^?` over
 * an interface's own name returns the name, so an interface entry would show
 * its identity and none of its fields, and a query reports no constructor at
 * all, so a reader asking what to pass `new NexusError(...)` would get
 * nothing.
 *
 * A printed declaration names types the fence has to import or it will not
 * compile, so the names it mentions are intersected with the entry point's own
 * export list and imported. A type parameter is not an export, so the `C` of
 * `provide<C extends Ctor>` falls out without being reasoned about. A
 * declaration naming a type the package does not publish fails `next build`,
 * which is the right outcome: a reference entry a reader cannot type out is
 * wrong.
 *
 * `merges` decides whether the entry's own name carries its docblock.
 * Twoslash compiles the fence, so it answers about the symbol the fence
 * declares, and a redeclared symbol has no docblock because the comment
 * stayed in the source that was printed from. A reader hovering the name gets
 * a type and nothing else, which defeats the purpose of a Twoslash fence.
 * A name declared again inside `declare module '<specifier>'` merges
 * with the published symbol and does not shadow it, so the hover answers for
 * the package and carries its documentation.
 *
 * TypeScript merges a second declaration of a function or an interface by
 * design, and refuses one of a class, a `const` or a type alias. So
 * those three keep the plain printed declaration and their own name's hover
 * shows a type with no prose. A type alias loses nothing by it: a printed alias
 * produces no hover on its own name either way. A class and a `const` do lose
 * the prose, and the entry carries it above the fence regardless, in the
 * summary and the disclosure, where the search index can also read it.
 */
function declarationOf(context, resolved, name, kind) {
  const { exported, root, packageDir, checker, workspace } = context;
  const declaration = resolved.getDeclarations()?.[0];
  if (!declaration) return null;

  // A `const` is declared inside a statement, and the statement is what
  // carries `declare` and the export modifier.
  const node = ts.isVariableDeclaration(declaration)
    ? declaration.parent.parent
    : declaration;
  const strip = (printed) =>
    printed.replace(/^export\s+/, '').replace(/^declare\s+/, '');
  // An export can rename its declaration (`resolveModuleRef as
  // moduleDefinitionOf`). The fence declares the name the package publishes,
  // since that is the name it merges with and a reader imports.
  const declared =
    declaration.name && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : name;
  const printed = printer
    .printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    .replace(
      new RegExp(
        `^((?:export\\s+)?(?:declare\\s+)?(?:function|class|interface|type|const|let|var|enum)\\s+)${escapeRegExp(declared)}(?![\\w$])`,
      ),
      // A function, so a `$` in the name is not read as a replacement pattern.
      (_match, head) => `${head}${name}`,
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
  const external = new Map();
  const seen = new Set();

  /**
   * Where each name the declaration mentions has to come from.
   *
   * There are five answers, and each applies to a different kind of name. A
   * name the documented entry point exports is imported from it. A name only
   * the package root exports is imported from there, which is what a second
   * entry point needs: `@nexusdi/core/text` declares `coreText`, whose type
   * names `BlueprintView`, and publishes no `BlueprintView` of its own. A name
   * a re-exported declaration names is imported from the package that
   * declared it, when that package exports it: `@nexusdi/devtools`'s
   * `TraceEventByType` is core's and names core's `Lifetime`. A name the
   * declaration file imports from another package is imported from that
   * package: `@nexusdi/devtools`'s `graph(ship: Nexus)` names a type only
   * `@nexusdi/core` publishes. A name the package declares and publishes
   * nowhere is printed into the fence above the cut (`provide` prints
   * `ClassOptions` this way), because a fence that leaves it unbound does not
   * always fail: a global of the same name, such as the DOM's `Node`, binds it
   * silently.
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

    // A declaration another package wrote, which this one re-exports
    // (`@nexusdi/devtools` publishes `@nexusdi/core`'s `TraceEventByType`),
    // names its own package's types. A name that package exports is imported
    // from it, as a reader would.
    const owner = ownerOf(from.getSourceFile().fileName);
    if (owner && owner.dir !== packageDir) {
      if (exportsOfPackage(workspace, owner.name).has(each)) {
        external.set(owner.name, [...(external.get(owner.name) ?? []), each]);
        return;
      }
    }

    const imported = importedFrom(each, from);
    if (imported) {
      external.set(imported, [...(external.get(imported) ?? []), each]);
      return;
    }

    // A name the checker resolves to a type declared inside the package is
    // private to it. Types only: a declaration's parameter names and property
    // names resolve too, and printing one puts `decision: Decision` at the top
    // of the fence as though it were a statement.
    // Followed through an import, since a declaration file names a private
    // type another file of the package declares (`views.d.ts` imports
    // `AnyToken` from `guards.d.ts`).
    const follow = (found) =>
      found && found.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(found)
        : found;
    const symbol = follow(
      checker.resolveName(each, from, ts.SymbolFlags.Type, false),
    );
    const target = symbol?.getDeclarations()?.[0];

    // A name another first-party package declares, reached through a module
    // of this one (`@nexusdi/hono`'s `Inject` names `DepsMap`, which its
    // internal module imports from `@nexusdi/core`), is imported from the
    // package that declares it when that package exports it, as a reader
    // would. One it keeps private is printed above the cut below.
    const declarer = target && firstParty(target.getSourceFile().fileName);
    if (declarer && declarer.dir !== packageDir) {
      if (exportsOfPackage(workspace, declarer.name).has(each)) {
        external.set(declarer.name, [
          ...(external.get(declarer.name) ?? []),
          each,
        ]);
        return;
      }
    }

    // A class built on `errorBase(...)` extends `X_base`, a const the
    // declaration file declares at the top level and never exports. It is
    // printed above the cut as the file declares it, `declare` kept, since a
    // `const` with no initializer outside an ambient context does not
    // compile. Parameter names are no variable declarations, so none of them
    // reaches here.
    const value = follow(
      checker.resolveName(each, from, ts.SymbolFlags.Value, false),
    );
    const variable = value?.getDeclarations()?.[0];
    if (
      !target &&
      variable &&
      ts.isVariableDeclaration(variable) &&
      ts.isVariableStatement(variable.parent.parent) &&
      ts.isSourceFile(variable.parent.parent.parent) &&
      variable.getSourceFile().fileName.startsWith(packageDir)
    ) {
      const printed = printer
        .printNode(
          ts.EmitHint.Unspecified,
          variable.parent.parent,
          variable.getSourceFile(),
        )
        .replace(/^export\s+/, '');
      const body = /^declare\s/.test(printed) ? printed : `declare ${printed}`;
      prelude.push(body);
      for (const mentioned of body.match(/[A-Za-z_$][\w$]*/g) ?? []) {
        if (mentioned !== each) place(mentioned, variable);
      }
      return;
    }
    const standalone =
      target &&
      (ts.isInterfaceDeclaration(target) ||
        ts.isTypeAliasDeclaration(target) ||
        ts.isEnumDeclaration(target));

    // A third-party package's private type stays out: a fence imports what
    // that package publishes, and its declarations are its own business.
    if (!standalone || !declarer) return;

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
    external: [...external],
    prelude,
  };
}

/**
 * Every docblock inside a symbol's declarations: the leading one and its
 * members'. A `const` carries its docblock on the statement around it.
 */
function docTextOf(resolved) {
  return (resolved.getDeclarations() ?? [])
    .map((declaration) =>
      ts.isVariableDeclaration(declaration)
        ? declaration.parent.parent
        : declaration,
    )
    .flatMap((node) => node.getFullText().match(/\/\*\*[\s\S]*?\*\//g) ?? [])
    .join('\n');
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
 * `examples` is workspace relative so that an example reference stays correct
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

  // The package root, when this is a second entry point. `@nexusdi/core/text`
  // declares `coreText` with a type naming `BlueprintView` and publishes no
  // `BlueprintView`, so a fence that imported only from `/text` would not
  // compile.
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
      { exported, root: rootExports, packageDir, checker, workspace: root },
      resolved,
      name,
      kind,
    ),
    rootSpecifier,
    summary,
    rest,
    tags,
    declaration,
    docText: docTextOf(resolved),
    examples: examplesFilesIn(packageDir).map((path) =>
      relative(root, path).split('\\').join('/'),
    ),
  };
}
