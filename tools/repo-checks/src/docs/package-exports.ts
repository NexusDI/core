import { moduleOf, resolve } from '@nexusdi/doc-examples/package-exports';
import ts from 'typescript';

/**
 * `readPackageExports` lives in `@nexusdi/doc-examples/package-exports`, which
 * `docs:behaviour-data` also reads under plain Node. Only the guards read the
 * two readers below.
 */
export { readPackageExports } from '@nexusdi/doc-examples/package-exports';

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
