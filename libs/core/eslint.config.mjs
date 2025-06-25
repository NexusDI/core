import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  // Suppress 'any', unused vars, and allow @ts-nocheck in decorators for DI/test flexibility
  {
    files: ['**/*.test.ts', 'src/decorators.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Allow @ts-nocheck in decorators.ts due to TypeScript decorator overload limitations
      '@typescript-eslint/ban-ts-comment': 'off',
      'eslint-comments/no-use': 'off',
    },
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vite.config.{js,ts,mjs,mts}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
