import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Tests cast through `never` and `any` to feed the container values its
    // types reject, which is how they reach the runtime checks.
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test-d.ts',
      '**/*.test-d.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // A type test states `Module.with;` under @ts-expect-error to prove a
      // member is absent.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // The fixture apps are consumers of the package, so they import it by
    // name, the way an application's modules do.
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
            '{projectRoot}/src/support/**',
            '{projectRoot}/test-support/**',
            '{projectRoot}/vitest.e2e.config.ts',
            '{projectRoot}/src/**/*.test-d.ts',
            '{projectRoot}/test-fixtures/**',
          ],
          // The React Router fixture's entry.server.tsx imports isbot, as
          // React Router's default entry does; nothing in the package does.
          ignoredDependencies: ['isbot'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
