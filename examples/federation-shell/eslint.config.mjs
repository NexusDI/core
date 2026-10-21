import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  // The Playwright rules read e2e/ only: the vitest tests under src/ have
  // their own test() and expect().
  { ...playwright.configs['flat/recommended'], files: ['e2e/**/*.ts'] },
  ...baseConfig,
];
