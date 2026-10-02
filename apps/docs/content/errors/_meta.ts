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
  NEXUS_INVALID_EXPORT: {
    title: 'NEXUS_INVALID_EXPORT',
    display: 'hidden',
  },
  NEXUS_INVALID_PROVIDER: {
    title: 'NEXUS_INVALID_PROVIDER',
    display: 'hidden',
  },
  NEXUS_INVALID_TOKEN: {
    title: 'NEXUS_INVALID_TOKEN',
    display: 'hidden',
  },
  NEXUS_INVALID_MODULE: {
    title: 'NEXUS_INVALID_MODULE',
    display: 'hidden',
  },
  NEXUS_MISSING_DEPS: {
    title: 'NEXUS_MISSING_DEPS',
    display: 'hidden',
  },
  NEXUS_CIRCULAR_DEPENDENCY: {
    title: 'NEXUS_CIRCULAR_DEPENDENCY',
    display: 'hidden',
  },
  NEXUS_LIFETIME_VIOLATION: {
    title: 'NEXUS_LIFETIME_VIOLATION',
    display: 'hidden',
  },
  NEXUS_MODULE_IMPORT_CYCLE: {
    title: 'NEXUS_MODULE_IMPORT_CYCLE',
    display: 'hidden',
  },
};

export default meta;
