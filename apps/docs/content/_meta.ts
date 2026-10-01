import type { MetaRecord } from 'nextra';

/**
 * The sidebar order is the teaching order (standard decision 19). Each band
 * is a separator, and the URLs stay flat (spec §4.1).
 */
const meta: MetaRecord = {
  '-- start': { type: 'separator', title: 'Start' },
  index: {
    title: 'NexusDI',
    theme: { layout: 'full', sidebar: false, toc: false },
  },
  '-- concepts': { type: 'separator', title: 'Concepts' },
  tokens: {
    title: 'Tokens',
    theme: { layout: 'full', toc: false },
  },
  // The navbar's Blog entry, hidden until the posts migrate at 0.4.0 final
  // (spec §4.1). The folder exists on every branch so the final root build
  // finds it (spec decision 35).
  blog: { title: 'Blog', type: 'page', display: 'hidden' },
};

export default meta;
