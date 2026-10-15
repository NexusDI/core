import nextEslintPluginNext from '@next/eslint-plugin-next';
import nx from '@nx/eslint-plugin';

import baseConfig from '../../eslint.config.mjs';

export default [
  { plugins: { '@next/next': nextEslintPluginNext } },
  ...nx.configs['flat/react-typescript'],
  ...baseConfig,
  {
    // `next build` writes .next and rewrites next-env.d.ts on every run.
    ignores: ['.next/**/*', '**/out-tsc', 'next-env.d.ts'],
  },
];
