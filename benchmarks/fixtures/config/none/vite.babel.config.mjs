import babel from '@rolldown/plugin-babel';

// The Vite migration guide's workaround for decorators: Babel runs over the
// TypeScript sources first, with this profile's babel.config.json.
export default {
  plugins: [
    babel({
      configFile: new URL('./babel.config.json', import.meta.url).pathname,
    }),
  ],
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
