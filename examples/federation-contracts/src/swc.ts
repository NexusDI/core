/**
 * The swc settings for standard decorators, which the rspack build and the
 * vitest transform both pass: the 2023-11 form that
 * examples/toolchain-matrix/.swcrc checks. Vite's own oxc transform does not
 * lower standard decorators, so vitest runs the sources through swc too.
 * This file imports nothing, so a vitest config can load it.
 */
export const decoratorsParser = { decorators: true } as const;
export const decoratorsTransform = { decoratorVersion: '2023-11' } as const;
