import ts from 'typescript';

/**
 * The callable surface of the libraries, read through one TypeScript program
 * over their sources, for the guards that ask what a reference page owes
 * each callable: `doc-option-keys` and `doc-overloads`.
 *
 * A package specifier resolves to the file its `@nexusdi/source` condition
 * names, the way `package-exports.mjs` reads an export list, so the program
 * needs no build and a guard sees the declarations a test run sees. The
 * program also holds any extra files a guard passes, which is how
 * `doc-overloads` compiles a page's fences beside the declarations their
 * calls resolve to.
 */

/** One library: its name and the source file of each entry, by specifier. */
export interface SurfacePackage {
  name: string;
  entries: ReadonlyMap<string, string>;
}

/** A file the program holds that is on no disk, by absolute path. */
export interface ExtraFile {
  path: string;
  text: string;
}

/**
 * The environment the docs site compiles a fence in (`compiler-options.ts`),
 * with the `dom` lib every `@nexusdi/react` fence gets, so one program
 * compiles every page. `lib.dom.d.ts` declares each global the site's
 * runtime globals file declares.
 */
const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['@nexusdi/source'],
  allowImportingTsExtensions: true,
  lib: [
    'lib.es2023.d.ts',
    'lib.esnext.disposable.d.ts',
    'lib.dom.d.ts',
    'lib.dom.iterable.d.ts',
  ],
  jsx: ts.JsxEmit.ReactJSX,
  moduleDetection: ts.ModuleDetectionKind.Force,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

/**
 * Every file read from disk, parsed once and shared by every program a test
 * run builds: the sources and libs do not change during a run.
 */
const parsed = new Map<string, ts.SourceFile | undefined>();

/** The program over every package's entries and the extra files. */
export function surfaceProgram(
  packages: readonly SurfacePackage[],
  extra: readonly ExtraFile[] = [],
): ts.Program {
  const files = new Map(extra.map((file) => [file.path, file.text]));
  const specifiers = new Map(packages.flatMap((each) => [...each.entries]));
  const base = ts.createCompilerHost(OPTIONS, true);
  const host: ts.CompilerHost = {
    ...base,
    fileExists: (name) => files.has(name) || base.fileExists(name),
    readFile: (name) => files.get(name) ?? base.readFile(name),
    getSourceFile: (name, version, onError, create) => {
      const text = files.get(name);
      if (text !== undefined)
        return ts.createSourceFile(name, text, version, true);
      if (!parsed.has(name))
        parsed.set(name, base.getSourceFile(name, version, onError, create));
      return parsed.get(name);
    },
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => {
        const entry = specifiers.get(literal.text);
        return entry === undefined
          ? ts.resolveModuleName(literal.text, containingFile, OPTIONS, host)
          : {
              resolvedModule: {
                resolvedFileName: entry,
                extension: entry.endsWith('.tsx')
                  ? ts.Extension.Tsx
                  : ts.Extension.Ts,
                isExternalLibraryImport: false,
              },
            };
      }),
  };
  return ts.createProgram({
    rootNames: [...specifiers.values(), ...files.keys()],
    options: OPTIONS,
    host,
  });
}

/** Whether a declaration sits in a TypeScript lib file or under node_modules. */
export function isForeignDeclaration(
  program: ts.Program,
  declaration: ts.Declaration,
): boolean {
  const file = declaration.getSourceFile();
  return (
    program.isSourceFileDefaultLibrary(file) ||
    program.isSourceFileFromExternalLibrary(file) ||
    file.fileName.includes('/node_modules/')
  );
}

/** One export of a package, alias resolved, deduplicated across its entries. */
export interface SurfaceExport {
  name: string;
  symbol: ts.Symbol;
}

/**
 * Every export of a package across its entries, sorted by name. A name two
 * entries export counts once, and `default` is left out, as G10 reads them.
 */
export function exportsOf(
  program: ts.Program,
  pkg: SurfacePackage,
): SurfaceExport[] {
  const checker = program.getTypeChecker();
  const found = new Map<string, ts.Symbol>();

  for (const file of pkg.entries.values()) {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error(`${file}: TypeScript found no module there.`);
    for (const each of checker.getExportsOfModule(module)) {
      const name = each.getName();
      if (name === 'default' || found.has(name)) continue;
      found.set(
        name,
        each.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(each)
          : each,
      );
    }
  }

  return [...found]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, symbol]) => ({ name, symbol }));
}

/**
 * One callable a reference page documents under an export's heading: the
 * export itself, called or constructed, or a public method of an exported
 * class.
 */
export interface Callable {
  /** The export whose `##` heading documents it. */
  heading: string;
  /**
   * How a finding names it: `lazy`, `new Token`, `Nexus.create` for a static
   * method and `Nexus#load` for an instance method.
   */
  label: string;
  signatures: readonly ts.Signature[];
}

const HIDDEN = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;

/** A member a caller outside the class can reach. */
const isPublic = (member: ts.Symbol): boolean =>
  !member.getName().startsWith('#') &&
  !member.getName().startsWith('__') &&
  (member.declarations ?? []).every(
    (declaration) => (ts.getCombinedModifierFlags(declaration) & HIDDEN) === 0,
  );

/** The methods a class declares itself, with their call signatures. */
function methodsOf(
  checker: ts.TypeChecker,
  type: ts.Type,
  owners: readonly ts.Declaration[],
): { name: string; signatures: readonly ts.Signature[] }[] {
  return checker
    .getPropertiesOfType(type)
    .filter(
      (member) =>
        member.getName() !== 'prototype' &&
        isPublic(member) &&
        (member.declarations ?? []).some((declaration) =>
          owners.includes(declaration.parent as ts.Declaration),
        ),
    )
    .map((member) => ({
      name: member.getName(),
      signatures: checker
        .getTypeOfSymbol(member)
        .getNonNullableType()
        .getCallSignatures(),
    }))
    .filter(({ signatures }) => signatures.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The callables an export documents: its call signatures, its construct
 * signatures, and for a class each public static and instance method the
 * class declares. A method a class inherits is documented under the class
 * that declares it.
 */
export function callablesOf(
  checker: ts.TypeChecker,
  { name, symbol }: SurfaceExport,
): Callable[] {
  if ((symbol.flags & ts.SymbolFlags.Value) === 0) return [];
  const type = checker.getTypeOfSymbol(symbol);
  const callables: Callable[] = [];
  const calls = type.getCallSignatures();
  const constructs = type.getConstructSignatures();
  if (calls.length > 0)
    callables.push({ heading: name, label: name, signatures: calls });
  if (constructs.length > 0)
    callables.push({
      heading: name,
      label: `new ${name}`,
      signatures: constructs,
    });

  if (symbol.flags & ts.SymbolFlags.Class) {
    const owners = symbol.declarations ?? [];
    for (const method of methodsOf(checker, type, owners))
      callables.push({
        heading: name,
        label: `${name}.${method.name}`,
        signatures: method.signatures,
      });
    for (const method of methodsOf(
      checker,
      checker.getDeclaredTypeOfSymbol(symbol),
      owners,
    ))
      callables.push({
        heading: name,
        label: `${name}#${method.name}`,
        signatures: method.signatures,
      });
  }

  return callables;
}

/**
 * Whether an export is an error class, which G10 exempts in the packages
 * whose error classes `/errors/` documents: a class whose name ends in
 * `Error`, the rule G10 applies beside its base-chain test.
 */
export const isErrorClass = ({ name, symbol }: SurfaceExport): boolean =>
  (symbol.flags & ts.SymbolFlags.Class) !== 0 && name.endsWith('Error');
