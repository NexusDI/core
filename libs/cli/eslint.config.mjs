import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  { ignores: ['test-fixtures/**'] },
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
          ],
          // Loaded at run time from the user's project by resolved path
          // (src/resolve.ts), so no import statement names them.
          ignoredDependencies: [
            '@nexusdi/core',
            'tsx',
            '@viz-js/viz',
            '@resvg/resvg-js',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
