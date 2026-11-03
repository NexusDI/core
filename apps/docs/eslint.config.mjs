// eslint-config-next 16 exports a native flat config, so it is spread
// directly. `core-web-vitals` already includes the base `next` and
// `next/typescript` configs.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nx from '@nx/eslint-plugin';

import baseConfig from '../../eslint.config.mjs';

const config = [
  ...nextCoreWebVitals,
  ...baseConfig,
  ...nx.configs['flat/react-typescript'],
  {
    // `next build` rewrites next-env.d.ts on every run, and the Docusaurus
    // overlay imports a config that exists only inside the 0.3 site.
    ignores: ['.next/**/*', 'out/**/*', 'next-env.d.ts', 'snapshot/**/*'],
  },
  {
    // The data targets (behaviour-data, benchmark-data, scene-fixtures) and
    // the build rewrite these paths, and eslint opens every file it finds
    // under them, so a parallel run fails with ENOENT when a target deletes a
    // file between the directory scan and the read. Their generators own the
    // content and nothing here is hand-written.
    ignores: [
      'generated/**/*',
      'public/behaviour/**/*',
      'public/code-classes.css',
      'public/runtime/**/*',
      'public/academy-runtime/**/*',
      'public/popups/**/*',
      'components/api/behaviour/**/*',
      'components/console/fixtures/**/*',
      'components/front-page/fixtures/**/*',
    ],
  },
];

export default config;
