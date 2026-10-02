import type { MetaRecord } from 'nextra';

/**
 * `/errors/` is the Errors concept page. Every other page here is the page a
 * NexusDI error code links to (`https://nexus.js.org/errors/<CODE>`), so the
 * folder is the one URL scheme the code fixes (spec §3.3, amendment A3). The
 * code pages stay out of the sidebar; `/api-errors/` lists them.
 */
const meta: MetaRecord = {
  index: { title: 'Errors' },
  NEXUS_BLUEPRINT_INVALID: {
    title: 'NEXUS_BLUEPRINT_INVALID',
    display: 'hidden',
  },
  NEXUS_MISSING_PROVIDER: {
    title: 'NEXUS_MISSING_PROVIDER',
    display: 'hidden',
  },
  NEXUS_AMBIGUOUS_PROVIDER: {
    title: 'NEXUS_AMBIGUOUS_PROVIDER',
    display: 'hidden',
  },
  NEXUS_DUPLICATE_PROVIDER: {
    title: 'NEXUS_DUPLICATE_PROVIDER',
    display: 'hidden',
  },
};

export default meta;
