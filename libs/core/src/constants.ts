// Tokenized constants for NexusDI core

export const SYMBOL_METADATA = 'Symbol.metadata';

// A registered symbol (`Symbol.for`), not a per-module `Symbol()`: the
// registry is process-global, so two copies of this package bundled
// together -- or a single copy whose classes a bundler renamed to dodge a
// scope collision -- still read and write the same key. `isToken` in
// guards.ts brands with this instead of comparing `constructor.name`, which
// a rename breaks.
export const TOKEN_BRAND = Symbol.for('nexusdi.token');

export const METADATA_KEYS = {
  DESIGN_PARAMTYPES: 'design:paramtypes',
  DESIGN_TYPE: 'design:type',
  INJECT_METADATA: 'nexusdi:inject',
  SERVICE_METADATA: 'nexusdi:service',
  PROVIDER_METADATA: 'nexusdi:provider',
  MODULE_METADATA: 'nexusdi:module',
} as const;
