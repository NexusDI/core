import baseConfig from '../../eslint.config.mjs';

const REPLAY =
  'The simulation replays from a seed, so src reads time from SIM_CLOCK and randomness from RNG.';

/**
 * Every name that reaches the wall clock, a timer, a random source or the
 * global object, which holds all of these under another name.
 * `queueMicrotask` stays allowed because a microtask runs in a fixed order.
 */
const HOST_GLOBALS = [
  'Date',
  'performance',
  'Temporal',
  'process',
  'crypto',
  'scheduler',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'globalThis',
  'global',
  'window',
  'self',
  'require',
  // A string of code reaches every name above.
  'eval',
  'Function',
  // Intl.DateTimeFormat().format() reads the clock.
  'Intl',
  // A collection or a shared-memory wait runs on the host's timing.
  'WeakRef',
  'FinalizationRegistry',
  'Atomics',
].map((name) => ({ name, message: REPLAY }));

const TYPES_ONLY = '@nexusdi/interceptors';

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Refuses every specifier but a relative path and the names in `allowed`.
 * `@nexusdi/interceptors` passes as `import type` alone: a value import
 * would load the package, which the library declares as an optional peer.
 */
const onlyRelativeAnd = (...allowed) => ({
  patterns: [
    {
      regex: `^(?!\\.{1,2}/|(${[...allowed, TYPES_ONLY].map(escape).join('|')})$)`,
      message: `${REPLAY} A file under src imports relative paths and ${allowed.join(', ')} alone.`,
    },
    {
      regex: `^${escape(TYPES_ONLY)}$`,
      allowTypeImports: true,
      message: `${REPLAY} A file under src imports ${TYPES_ONLY} as import type alone.`,
    },
  ],
});

export default [
  ...baseConfig,
  {
    ignores: ['**/out-tsc'],
  },
  {
    // The replay rules, enforced on the syntax tree. The repo-check in
    // tools/repo-checks/src/meridian-purity.test.ts pins each entry.
    files: ['src/**/*.ts'],
    rules: {
      // The base rule cannot tell import type from import.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        onlyRelativeAnd('@nexusdi/core'),
      ],
      // import { type A } keeps a bare import of the package at runtime.
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'no-restricted-globals': ['error', ...HOST_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: REPLAY },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // no-restricted-imports reads static imports alone.
          selector: 'ImportExpression',
          message: `${REPLAY} A file under src imports statically.`,
        },
        {
          // An alias, Reflect.get or a property descriptor reads Math.random
          // past no-restricted-properties, which matches `Math.random` alone.
          selector:
            "Identifier[name='Math']:not(MemberExpression[computed=false] > Identifier.object)",
          message: `${REPLAY} A file under src reads Math through Math.name alone.`,
        },
        {
          selector: "MemberExpression[object.name='Math'][computed=true]",
          message: `${REPLAY} A file under src reads Math through Math.name alone.`,
        },
        {
          // Any value's constructor chain reaches the Function constructor,
          // which runs a string of code past the globals above.
          selector:
            "MemberExpression:matches([property.name='constructor'][computed=false], [property.value='constructor'])",
          message: `${REPLAY} A file under src reads no constructor property.`,
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        // A test reads shipText through explain(), as an errors() call does.
        onlyRelativeAnd('@nexusdi/core', '@nexusdi/errors', 'vitest'),
      ],
    },
  },
];
