import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import ts from 'typescript';

export interface ExportInfo {
  name: string;
  /** A value with a call or construct signature: a function or a class. */
  callable: boolean;
  /** A type, an interface, or a type-only re-export. */
  typeOnly: boolean;
  /** A class whose chain reaches `Error`. */
  error: boolean;
}

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['@nexusdi/source'],
  allowImportingTsExtensions: true,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

function moduleOf(file: string): {
  checker: ts.TypeChecker;
  symbol: ts.Symbol;
} {
  const program = ts.createProgram([file], OPTIONS);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`${file}: TypeScript found no module there.`);
  return { checker, symbol };
}

function resolve(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isErrorType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.getSymbol()?.getName() === 'Error') return true;
  if (!type.isClassOrInterface()) return false;
  return checker.getBaseTypes(type).some((base) => isErrorType(base, checker));
}

/** Every export of one module, sorted by name. */
function exportsOfFile(file: string): ExportInfo[] {
  const { checker, symbol } = moduleOf(file);

  return checker
    .getExportsOfModule(symbol)
    .map((each) => {
      const resolved = resolve(each, checker);
      const typeOnly = (resolved.flags & ts.SymbolFlags.Value) === 0;
      const type = typeOnly ? null : checker.getTypeOfSymbol(resolved);
      const callable =
        type !== null &&
        (type.getCallSignatures().length > 0 ||
          type.getConstructSignatures().length > 0);
      const error =
        (resolved.flags & ts.SymbolFlags.Class) !== 0 &&
        isErrorType(checker.getDeclaredTypeOfSymbol(resolved), checker);

      return { name: each.getName(), callable, typeOnly, error };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every entry of a package's exports map, keyed by the specifier a reader
 * writes, read from the file the `@nexusdi/source` condition names.
 */
export function readPackageExports(
  packageJson: string,
): Map<string, ExportInfo[]> {
  const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as {
    name: string;
    exports: Record<string, unknown>;
  };
  const exports = new Map<string, ExportInfo[]>();

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (typeof target !== 'object' || target === null) continue;
    const source = (target as Record<string, string>)['@nexusdi/source'];
    if (source === undefined) continue;

    const specifier =
      subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
    exports.set(specifier, exportsOfFile(join(dirname(packageJson), source)));
  }

  return exports;
}

function exported(
  file: string,
  name: string,
): { checker: ts.TypeChecker; symbol: ts.Symbol } | null {
  const { checker, symbol } = moduleOf(file);
  const found = checker
    .getExportsOfModule(symbol)
    .find((each) => each.getName() === name);
  return found ? { checker, symbol: resolve(found, checker) } : null;
}

/** The strings of an exported `[…] as const` array, or null when it is absent. */
export function readConstStrings(file: string, name: string): string[] | null {
  const found = exported(file, name);
  const declaration = found?.symbol.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null;

  let initializer = declaration.initializer;
  while (
    initializer &&
    (ts.isAsExpression(initializer) ||
      ts.isSatisfiesExpression(initializer) ||
      ts.isParenthesizedExpression(initializer))
  ) {
    initializer = initializer.expression;
  }
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) return null;

  return initializer.elements
    .filter(ts.isStringLiteral)
    .map((element) => element.text);
}

/**
 * The string values an exported union type, string enum or `as const` object
 * holds, or null when the name is absent. `NexusErrorCode` may be any of the
 * three, so the reader accepts each.
 */
export function readLiteralUnion(file: string, name: string): string[] | null {
  const found = exported(file, name);
  if (!found) return null;
  const { checker, symbol } = found;

  const type =
    symbol.flags & ts.SymbolFlags.Value && !(symbol.flags & ts.SymbolFlags.Enum)
      ? checker.getTypeOfSymbol(symbol)
      : checker.getDeclaredTypeOfSymbol(symbol);
  const members = type.isUnion()
    ? type.types
    : type.isStringLiteral()
      ? [type]
      : checker
          .getPropertiesOfType(type)
          .map((property) => checker.getTypeOfSymbol(property));

  return members
    .filter((member): member is ts.StringLiteralType =>
      member.isStringLiteral(),
    )
    .map((member) => member.value)
    .sort();
}
