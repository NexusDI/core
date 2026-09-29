// A server build: Node target, the libraries left as imports of the
// installed packages. Oxc reads the decorator flags from the consumer's
// tsconfig.json, which the matrix copies from this profile.
export default {
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
