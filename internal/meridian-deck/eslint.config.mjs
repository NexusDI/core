import baseConfig, { moduleBoundaries } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['**/out-tsc'],
  },
  {
    // meridian-systems ships its sources and has no build target, so the rule
    // that bars a buildable library from importing an unbuildable one
    // refuses it. Every consumer of `./maps` and `./bindings` already compiles
    // those sources. `.`, `./view` and `./testing` stay under the full rule
    // because the docs app reads their declarations with a plain `tsc`.
    files: ['src/maps/**/*.ts', 'src/bindings/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          ...moduleBoundaries,
          allow: [
            ...moduleBoundaries.allow,
            '^@nexusdi/meridian-systems(/(maps|geometry))?$',
          ],
        },
      ],
    },
  },
];
