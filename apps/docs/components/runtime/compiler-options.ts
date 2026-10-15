import { join } from 'node:path';

/**
 * The one TypeScript environment the site compiles examples in (spec section
 * 11.2). The twoslash prelude reads it now, and the Playground worker reads it
 * when it arrives. It names no `dom` lib (section 11.3), so
 * `runtime-globals.d.ts` declares the globals an example may use.
 */
export const compilerOptions = {
  target: 'es2022',
  module: 'esnext',
  moduleResolution: 'bundler',
  strict: true,
  lib: ['es2023', 'esnext.disposable'],
} as const;

/** The declarations of the globals an example may use. */
export const RUNTIME_GLOBALS_FILE = join(
  import.meta.dirname,
  'runtime-globals.d.ts',
);
