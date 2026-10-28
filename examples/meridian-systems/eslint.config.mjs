import importPlugin from 'eslint-plugin-import';

import baseConfig from '../../eslint.config.mjs';

const REPLAY =
  'The simulation replays from a seed, so src reads time from SIM_CLOCK and randomness from RNG.';

/**
 * Every name that reaches the wall clock, a timer, a random source, the
 * network or the global object, which holds all of these under another name.
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
  // Bun.nanoseconds() reads the clock and Deno.connect() the network, and the
  // library runs on both.
  'Bun',
  'Deno',
].map((name) => ({ name, message: REPLAY }));

/** The relay file, the one file under src that calls fetch. */
const RELAY = 'src/systems/comms/subspace-relay.ts';

const FETCH = {
  name: 'fetch',
  message: `A tick does no I/O, so ${RELAY} alone calls fetch.`,
};

/**
 * Every global of Node, workerd, Deno and Bun that reaches the network or
 * loads code from it. `navigator` is refused whole, since a property rule
 * misses `const n = navigator` and `const { sendBeacon } = navigator`, and the
 * global rule catches both.
 */
const NETWORK = [
  'WebSocket',
  'XMLHttpRequest',
  'EventSource',
  'navigator',
  'WebTransport',
  'importScripts',
  // Deno and Bun hold a global Worker, and Deno loads a remote module worker.
  'Worker',
  'WebSocketStream',
].map((name) => ({
  name,
  message: `A tick does no I/O, so ${RELAY} alone reaches the network, through fetch.`,
}));

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
    // Packages first, then parent paths, then sibling paths, one blank line
    // between the groups.
    files: ['**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'parent', ['sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
    },
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
      'no-restricted-globals': ['error', ...HOST_GLOBALS, ...NETWORK, FETCH],
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
    // NAV_CHARTS's factory downloads the charts over the relay once at
    // startup, so the relay alone reaches the network.
    files: [RELAY],
    rules: {
      'no-restricted-globals': ['error', ...HOST_GLOBALS, ...NETWORK],
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
