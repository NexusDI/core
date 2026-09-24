// A server build: Node target, @nexusdi/core left as an import of the
// installed tarball.
export default {
  build: { ssr: true, target: 'node22', minify: false },
  ssr: { external: ['@nexusdi/core'] },
};
