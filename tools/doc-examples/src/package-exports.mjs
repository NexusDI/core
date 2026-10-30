import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import ts from 'typescript';

/**
 * What a package exports, read through the TypeScript compiler from the source
 * the `@nexusdi/source` condition names.
 *
 * Plain JavaScript for the reason `regions.d.mts` gives: `docs:behaviour-data`
 * runs under plain Node and reads it, and the repo-checks guards read it too,
 * so the sidecars and the guards agree on one export list.
 */

const OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['@nexusdi/source'],
  allowImportingTsExtensions: true,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

/** The checker over one module, and the module's own symbol. */
export function moduleOf(file) {
  const program = ts.createProgram([file], OPTIONS);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`${file}: TypeScript found no module there.`);
  return { checker, symbol };
}

/** The symbol a re-export stands for, or the symbol itself. */
export function resolve(symbol, checker) {
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

/**
 * Whether a type's chain reaches `Error`. A NexusDI error class extends a
 * mixin, `class DisposedError extends errorBase<…>(…)`, whose base is an
 * intersection holding the generic `NexusError<…>`, so the walk goes through
 * each part of an intersection and from a generic reference to its class.
 */
function isErrorType(type, checker) {
  if (type.getSymbol()?.getName() === 'Error') return true;
  if (type.isIntersection())
    return type.types.some((part) => isErrorType(part, checker));
  if (type.objectFlags & ts.ObjectFlags.Reference && type.target !== type)
    return isErrorType(type.target, checker);
  if (!type.isClassOrInterface()) return false;
  return checker.getBaseTypes(type).some((base) => isErrorType(base, checker));
}

/** Every export of one module, with the file each one is declared in. */
function exportsOfFile(file) {
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
      const declaration =
        resolved.valueDeclaration ?? resolved.declarations?.[0];

      return {
        info: { name: each.getName(), callable, typeOnly, error },
        declaredIn: declaration?.getSourceFile().fileName ?? null,
      };
    })
    .sort((a, b) => a.info.name.localeCompare(b.info.name));
}

/**
 * Each entry of the exports map that names a `@nexusdi/source` file: the
 * specifier a reader writes and the absolute path of the source file.
 */
export function entriesOf(packageJson) {
  const manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
  const entries = [];

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (typeof target !== 'object' || target === null) continue;
    const source = target['@nexusdi/source'];
    if (source === undefined) continue;

    entries.push({
      specifier:
        subpath === '.'
          ? manifest.name
          : `${manifest.name}/${subpath.slice(2)}`,
      file: join(dirname(packageJson), source),
    });
  }

  return entries;
}

/**
 * Every entry of a package's exports map, keyed by the specifier a reader
 * writes, read from the file the `@nexusdi/source` condition names.
 */
export function readPackageExports(packageJson) {
  return new Map(
    entriesOf(packageJson).map(({ specifier, file }) => [
      specifier,
      exportsOfFile(file).map((each) => each.info),
    ]),
  );
}

/**
 * The file each export of each entry is declared in, keyed like
 * `readPackageExports`. A re-export reports the file of the declaration it
 * stands for.
 */
export function readDeclarationFiles(packageJson) {
  return new Map(
    entriesOf(packageJson).map(({ specifier, file }) => [
      specifier,
      exportsOfFile(file).map((each) => ({
        name: each.info.name,
        declaredIn: each.declaredIn,
      })),
    ]),
  );
}

/**
 * Every name a package exports, across all of its entries, `default` left
 * out. An API page carries one entry per name whatever entry point publishes
 * it, so `coreText` from `@nexusdi/core/text` counts beside `Nexus`.
 */
export function exportedNames(packageJson) {
  return new Set(
    [...readPackageExports(packageJson).values()]
      .flat()
      .map((each) => each.name)
      .filter((name) => name !== 'default'),
  );
}
