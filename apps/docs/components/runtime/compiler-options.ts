import { join } from 'node:path';

/**
 * The one TypeScript environment the site compiles examples in (spec section
 * 11.2). The twoslash prelude reads it now, and the Playground worker reads it
 * when it arrives. It names no `dom` lib (section 11.3), so
 * `runtime-globals.d.ts` declares the globals an example may use.
 */
const compilerOptions = {
  target: 'es2022',
  module: 'esnext',
  moduleResolution: 'bundler',
  strict: true,
  lib: ['es2023', 'esnext.disposable'],
} as const;

/**
 * The options a fence gets for a first-party package it imports, over
 * `compilerOptions`, keyed by the package's name as the reference loader keys
 * a package. `@nexusdi/react` renders into a document, and its examples read
 * `textContent` and call `click()` on what they rendered, so its fences get
 * the `dom` lib (site spec section 11.3). No other package does.
 */
const packageCompilerOptions: Readonly<
  Record<string, Partial<Record<keyof typeof compilerOptions, unknown>>>
> = {
  '@nexusdi/react': { lib: [...compilerOptions.lib, 'dom', 'dom.iterable'] },
};

/** The first-party packages a fence's code imports, by name. */
const IMPORTED = /\bfrom\s+['"](@nexusdi\/[\w-]+)(?:\/[^'"]*)?['"]/g;

/**
 * The options for one fence: `compilerOptions` with the override of every
 * first-party package the code imports.
 */
export function compilerOptionsFor(
  code: string,
): Record<keyof typeof compilerOptions, unknown> {
  const imported = new Set(
    [...code.matchAll(IMPORTED)].map(([, name]) => name),
  );
  return Object.assign(
    { ...compilerOptions },
    ...[...imported].sort().map((name) => packageCompilerOptions[name] ?? {}),
  );
}

/** The declarations of the globals an example may use. */
export const RUNTIME_GLOBALS_FILE = join(
  import.meta.dirname,
  'runtime-globals.d.ts',
);
