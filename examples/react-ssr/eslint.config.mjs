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
];
