// Tokenized constants for NexusDI core

export const SYMBOL_METADATA = 'Symbol.metadata';

/**
 * Metadata keys used by NexusDI decorators.
 * These are used to store and retrieve decorator metadata from classes.
 */
export const METADATA_KEYS = {
  INJECT_METADATA: Symbol('nexus:inject'),
  PROVIDER_METADATA: Symbol('nexus:provider'),
  SERVICE_METADATA: Symbol('nexus:service'),
  MODULE_METADATA: Symbol('nexus:module'),
} as const;
