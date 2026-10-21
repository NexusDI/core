import playwright from 'eslint-plugin-playwright';
import nx from '@nx/eslint-plugin';
import baseConfig, { sharedRules } from '../../eslint.config.mjs';

export default [
  // The Playwright rules read e2e/ only: the vitest tests under tests/
  // have their own test() and expect().
  { ...playwright.configs['flat/recommended'], files: ['e2e/**/*.ts'] },
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // flat/react sets some rules that baseConfig's sharedRules block also
    // sets, so the block goes last and its settings win. The root config's
    // doc comment on sharedRules says why each rule is there.
    rules: sharedRules,
  },
];
