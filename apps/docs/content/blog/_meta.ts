import type { MetaRecord } from 'nextra';

/**
 * The blog (spec §6.2), outside the sidebar. The posts migrate here at
 * 0.4.0 final (phase 3), each with an entry of its own.
 */
const meta: MetaRecord = {
  index: {
    title: 'Blog',
    theme: { sidebar: false, toc: false, pagination: false },
  },
};

export default meta;
