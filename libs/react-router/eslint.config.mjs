import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Tests cast through `never` and `any` to feed the container values its
    // types reject, which is how they reach the runtime checks.
    files: ['**/*.test.ts', '**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // A type test states `Module.with;` under @ts-expect-error to prove a
      // member is absent.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // The fixture app is a consumer of the package, so it imports it by
    // name, the way an application's route modules do.
    files: ['test-fixtures/**/*.{ts,tsx}'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
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
            '{projectRoot}/test-support/**',
            '{projectRoot}/src/**/*.test-d.ts',
            '{projectRoot}/test-fixtures/**',
          ],
          // The fixture app's entry.server.tsx imports isbot, as React
          // Router's default entry does; nothing in the package does.
          ignoredDependencies: ['isbot'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
