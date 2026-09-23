import nx from '@nx/eslint-plugin';

/**
 * Rules every project ends up with, whatever else its own config pulls in.
 *
 * Exported because a per-project config spreads an nx preset after this file
 * and those presets re-enable some of what is set here. Applying this object
 * last in each project's config is what makes these the effective settings.
 */
export const sharedRules = {
  // An error, not a warning: core is published as typed, so an `any` in a
  // public signature is a defect in the product. Where TypeScript offers no
  // alternative, the `any` carries an inline disable naming the reason.
  '@typescript-eslint/no-explicit-any': 'error',

  // The base rule does not understand TypeScript overload signatures and
  // flags every overloaded function as a redeclaration.
  'no-redeclare': 'off',
  '@typescript-eslint/no-redeclare': 'error',

  '@typescript-eslint/no-empty-function': 'off',
};

export default [
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      // Where tsc puts the declarations it emits only because `tsc --build`
      // has no check-only mode. Generated, never shipped, never read.
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/build',
      '**/.react-router',
      '**/test-output',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: sharedRules,
  },
];
