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
  {
    // The seam for MeridianOS: components take data through props. Hooks in
    // app/hooks/ read the container. Type imports stay allowed.
    files: ['app/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nexusdi/*', '!@nexusdi/meridian-ui'],
              allowTypeImports: true,
              message:
                'Components take data through props. Read the container in app/hooks/.',
            },
          ],
        },
      ],
    },
  },
];
