/** Types for `package-exports.mjs`. */
import type ts from 'typescript';

export interface ExportInfo {
  name: string;
  /** A value with a call or construct signature: a function or a class. */
  callable: boolean;
  /** A type, an interface, or a type-only re-export. */
  typeOnly: boolean;
  /** A class whose chain reaches `Error`. */
  error: boolean;
}

/** Where one export is declared. */
export interface DeclarationFile {
  name: string;
  /** The absolute path of the declaring source file, or null when none. */
  declaredIn: string | null;
}

export declare function moduleOf(file: string): {
  checker: ts.TypeChecker;
  symbol: ts.Symbol;
};

export declare function resolve(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): ts.Symbol;

export declare function readPackageExports(
  packageJson: string,
): Map<string, ExportInfo[]>;

export declare function readDeclarationFiles(
  packageJson: string,
): Map<string, DeclarationFile[]>;

export declare function exportedNames(packageJson: string): Set<string>;
