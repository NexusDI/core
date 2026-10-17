import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ...playwright.configs['flat/recommended'],
    files: ['src/**/*.spec.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // openCase asserts that the case region is visible before it returns.
      'playwright/expect-expect': [
        'warn',
        { assertFunctionNames: ['expect', 'openCase'] },
      ],
      // The touch tests run in WebKit only (the iOS engine), so they skip
      // themselves on the other two engines.
      'playwright/no-skipped-test': ['warn', { allowConditional: true }],
    },
  },
  {
    ignores: ['**/out-tsc', '**/.site', '**/.next-out', '**/test-output'],
  },
];
