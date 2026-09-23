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
};

export default meta;
