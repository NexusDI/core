import nx from '@nx/eslint-plugin';
import baseConfig, { sharedRules } from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // flat/react re-enables some of what baseConfig's sharedRules block
    // turns off/on, so it is re-applied last here to stay the effective
    // setting -- see the doc comment on sharedRules in the root config.
    rules: sharedRules,
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // The root rule, plus @nexusdi/bridge-api: that example exports its
      // TypeScript sources, which this app's bundler compiles (vite.config.ts
      // ssr.noExternal), so it has no build of its own to depend on.
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$',
            '^@nexusdi/doc-examples(/.+)?$',
            '^@nexusdi/bridge-api(/.+)?$',
          ],
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }],
        },
      ],
    },
  },
];
