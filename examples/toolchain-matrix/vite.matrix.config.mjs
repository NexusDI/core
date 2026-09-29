// A server build: Node target, the @nexusdi packages left as imports of the
// installed tarballs.
export default {
  build: { ssr: true, target: 'node22', minify: false },
  ssr: {
    external: ['@nexusdi/core', '@nexusdi/devtools', '@nexusdi/errors'],
  },
};
