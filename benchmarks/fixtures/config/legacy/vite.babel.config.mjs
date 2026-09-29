import { readFileSync } from 'node:fs';

import babel from '@rolldown/plugin-babel';

// The Vite migration guide's workaround for decorators: Babel runs over the
// TypeScript sources first. The plugin loads no Babel config file, so this
// passes it the profile's babel.config.json.
const { presets, plugins } = JSON.parse(
  readFileSync(new URL('./babel.config.json', import.meta.url), 'utf8'),
);

export default {
  plugins: [babel({ presets, plugins })],
  build: { ssr: true, target: 'node22', minify: false },
  ssr: {
    external: [
      '@nexusdi/core',
      '@nexusdi/decorators',
      'inversify',
      'tsyringe',
      'awilix',
      '@needle-di/core',
      'reflect-metadata',
    ],
  },
};
