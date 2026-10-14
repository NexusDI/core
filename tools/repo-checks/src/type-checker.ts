import { dirname, join } from 'node:path';

import ts from 'typescript';

import type { Sources } from './core-layers.js';

/** Other packages' sources a program resolves package specifiers to. */
export interface Packages {
  /** Each file, by a path no file of the checked package takes. */
  readonly files: Sources;
  /** The path of the file each specifier names, such as `@acme/core`. */
  readonly entries: ReadonlyMap<string, string>;
}

const LIB_DIR = dirname(ts.getDefaultLibFilePath({}));
const LIB = 'lib.es2022.d.ts';
const libFiles = new Map<string, ts.SourceFile | undefined>();

/** A default lib file, parsed once and shared by every package's checker. */
function libFile(name: string): ts.SourceFile | undefined {
  if (!libFiles.has(name)) {
    const text = ts.sys.readFile(name);
    libFiles.set(
      name,
      text === undefined
        ? undefined
        : ts.createSourceFile(name, text, ts.ScriptTarget.ESNext, true),
    );
  }
  return libFiles.get(name);
}

/**
 * A type checker over one package's sources and the es2022 lib. It
 * resolves local bindings, relative imports and lib types. A package
 * specifier resolves only when `packages` names it; every other module
 * outside the package is unresolved, and its types are `any`.
 */
export function checkerOf(
  sources: Sources,
  packages?: Packages,
): ts.TypeChecker {
  const fileOf = (name: string) =>
    sources.get(name) ?? packages?.files.get(name);
  const options: ts.CompilerOptions = {
    lib: [LIB],
    noEmit: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host: ts.CompilerHost = {
    getSourceFile: (name) =>
      name.startsWith(LIB_DIR) ? libFile(name) : fileOf(name),
    fileExists: (name) =>
      name.startsWith(LIB_DIR)
        ? ts.sys.fileExists(name)
        : fileOf(name) !== undefined,
    readFile: (name) =>
      name.startsWith(LIB_DIR) ? ts.sys.readFile(name) : fileOf(name)?.text,
    getDefaultLibFileName: () => join(LIB_DIR, LIB),
    getDefaultLibLocation: () => LIB_DIR,
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => {
        const entry = packages?.entries.get(literal.text);
        return entry === undefined
          ? ts.resolveModuleName(literal.text, containingFile, options, host)
          : {
              resolvedModule: {
                resolvedFileName: entry,
                extension: ts.Extension.Ts,
                isExternalLibraryImport: false,
              },
            };
      }),
  };
  return ts
    .createProgram({ rootNames: [...sources.keys()], options, host })
    .getTypeChecker();
}
