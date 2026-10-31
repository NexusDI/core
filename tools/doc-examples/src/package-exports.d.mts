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

export declare function modulesOf(files: readonly string[]): {
  checker: ts.TypeChecker;
  symbols: ts.Symbol[];
};

export declare function moduleOf(file: string): {
  checker: ts.TypeChecker;
  symbol: ts.Symbol;
};

export declare function resolve(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): ts.Symbol;

/** One entry of a package's exports map that names a source file. */
export interface SourceEntry {
  /** The specifier a reader writes, such as `@nexusdi/core/text`. */
  specifier: string;
  /** The absolute path of the file the `@nexusdi/source` condition names. */
  file: string;
}

export declare function entriesOf(packageJson: string): SourceEntry[];

export declare function readPackageExports(
  packageJson: string,
): Map<string, ExportInfo[]>;

export declare function readDeclarationFiles(
  packageJson: string,
): Map<string, DeclarationFile[]>;

export declare function exportedNames(packageJson: string): Set<string>;
