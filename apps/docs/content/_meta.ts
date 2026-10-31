import type { MetaRecord } from 'nextra';

/**
 * The teaching order (standard decision 19) and the navbar.
 *
 * URLs are flat: a separator names each band, and the only folders are
 * `blog/` and `errors/` (spec §4.1). Each page task adds its own entry under
 * its band. `docs` and `blog` are navbar entries.
 */
const meta: MetaRecord = {
  '-- start': { type: 'separator', title: 'Start' },
  index: {
    title: 'NexusDI',
    theme: { layout: 'full', sidebar: false, toc: false },
  },
  'getting-started': { title: 'Getting started' },
  '-- concepts': { type: 'separator', title: 'Concepts' },
  tokens: { title: 'Tokens and interfaces' },
  providers: { title: 'Providers' },
  lifetimes: { title: 'Lifetimes' },
  modules: { title: 'Modules' },
  'configurable-modules': { title: 'Configurable modules' },
  scopes: { title: 'Scopes and REQUEST' },
  lifecycle: { title: 'Lifecycle and disposal' },
  lazy: { title: 'Lazy edges and cycles' },
  'multi-providers': { title: 'Multi-providers' },
  errors: { title: 'Errors' },
  introspection: { title: 'Introspection and trace' },
  '-- guides': { type: 'separator', title: 'Guides' },
  plugins: { title: 'Register a plugin' },
  testing: { title: 'How do I replace a provider in a test?' },
  'node-request-scopes': { title: 'Scope an HTTP request in Node' },
  hono: { title: 'Scope a Hono request' },
  express: { title: 'Scope an Express request' },
  fastify: { title: 'Scope a Fastify request' },
  edge: { title: 'Run on edge runtimes' },
  'scope-context': { title: 'How do I scope requests outside Node?' },
  react: { title: 'Use services in React components' },
  'react-router-ssr': { title: 'React Router server rendering' },
  vitest: { title: 'How do I get a container in every Vitest test?' },
  nextjs: { title: 'Scope a Next.js route handler or server action' },
  load: { title: 'How do I add a module after startup?' },
  decorators: { title: 'How do I write providers with decorators?' },
  'legacy-decorators': {
    title:
      'How do I use NexusDI in a project that keeps experimentalDecorators?',
  },
  interceptors: { title: 'Interceptors' },
  'graph-cli': { title: 'Graph CLI' },
  profiling: { title: 'How do I find out what slows or stalls startup?' },
  'trace-events': { title: 'What the trace events promise' },
  'error-text': { title: 'Full error text' },
  'build-an-extension-point': { title: 'Build an extension point' },
  'write-a-plugin': { title: 'Write a plugin' },
  'extension-contract': { title: 'Guarantees for plugin and adapter authors' },
  federation: {
    title: 'How do I share tokens between a shell and its remotes?',
  },
  comparison: {
    title: 'NexusDI compared with InversifyJS, tsyringe, awilix and needle-di',
  },
  'benchmark-method': { title: "How NexusDI's benchmarks are measured" },
  runtimes: { title: 'Where NexusDI runs' },
  '-- migration': { type: 'separator', title: 'Migration' },
  'release-candidate': { title: 'How do I try the 0.4 release candidate?' },
  upgrade: { title: 'How do I upgrade from 0.3 to 0.4?' },
  'support-policy': { title: '0.3 support policy' },
  '-- api': { type: 'separator', title: 'API' },
  api: { title: '@nexusdi/core' },
  'api-errors': { title: 'Error codes' },
  'api-node': { title: '@nexusdi/node' },
  'api-testing': { title: '@nexusdi/testing' },
  'api-decorators': { title: '@nexusdi/decorators' },
  'api-errors-package': { title: '@nexusdi/errors' },
  'api-devtools': { title: '@nexusdi/devtools' },
  'api-federation': { title: '@nexusdi/federation' },
  'api-interceptors': { title: '@nexusdi/interceptors' },
  'api-hono': { title: '@nexusdi/hono' },
  'api-express': { title: '@nexusdi/express' },
  'api-fastify': { title: '@nexusdi/fastify' },
  'api-react-router': { title: '@nexusdi/react-router' },
  'api-react': { title: '@nexusdi/react' },
  'api-vitest': { title: '@nexusdi/vitest' },
  docs: { title: 'Docs', type: 'page', href: '/getting-started/' },
  // The navbar's Blog entry, hidden until the posts migrate at 0.4.0 final
  // (spec §4.1). The folder exists on every branch so the final root build
  // finds it (spec decision 35).
  blog: { title: 'Blog', type: 'page', display: 'hidden' },
};

export default meta;
