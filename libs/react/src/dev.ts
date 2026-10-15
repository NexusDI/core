// The one read of the environment in the package. tools/repo-checks
// core-layers.ts names this file: every React toolchain replaces the
// expression at build time, as React itself relies on.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** True in development and tests; false in a production build. */
export const dev = process.env.NODE_ENV !== 'production';
