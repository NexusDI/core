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
  load: { title: 'How do I add a module after startup?' },
  decorators: { title: 'How do I write providers with decorators?' },
  'legacy-decorators': {
    title:
      'How do I use NexusDI in a project that keeps experimentalDecorators?',
  },
  interceptors: { title: 'Interceptors' },
  'graph-cli': { title: 'Graph CLI' },
  'error-text': { title: 'Full error text' },
  'write-a-plugin': { title: 'Write a plugin' },
  'benchmark-method': { title: "How NexusDI's benchmarks are measured" },
  '-- migration': { type: 'separator', title: 'Migration' },
  'release-candidate': { title: 'How do I try the 0.4 release candidate?' },
  upgrade: { title: 'How do I upgrade from 0.3 to 0.4?' },
  'support-policy': { title: '0.3 support policy' },
  '-- api': { type: 'separator', title: 'API' },
  'api-errors': { title: 'Error codes' },
  docs: { title: 'Docs', type: 'page', href: '/getting-started/' },
  // The navbar's Blog entry, hidden until the posts migrate at 0.4.0 final
  // (spec §4.1). The folder exists on every branch so the final root build
  // finds it (spec decision 35).
  blog: { title: 'Blog', type: 'page', display: 'hidden' },
};

export default meta;
