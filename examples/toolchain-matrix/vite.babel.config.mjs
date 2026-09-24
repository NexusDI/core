import babel from '@rolldown/plugin-babel';

// Vite 8's Oxc passes standard decorators through. The Vite migration
// guide's workaround runs Babel's decorator transform over the TypeScript
// sources first.
export default {
  plugins: [
    babel({
      presets: ['@babel/preset-typescript'],
      plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
    }),
  ],
  build: { ssr: true, target: 'node22', minify: false },
  ssr: { external: ['@nexusdi/core'] },
};
