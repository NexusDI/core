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
  tokens: { title: 'Tokens' },
  docs: { title: 'Docs', type: 'page', href: '/getting-started/' },
  // The navbar's Blog entry, hidden until the posts migrate at 0.4.0 final
  // (spec §4.1). The folder exists on every branch so the final root build
  // finds it (spec decision 35).
  blog: { title: 'Blog', type: 'page', display: 'hidden' },
};

export default meta;
