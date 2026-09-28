import { errorBase } from './nexus-error.js';

interface OverrideFields {
  readonly code: 'NEXUS_OVERRIDE_UNUSED' | 'NEXUS_OVERRIDE_EXPORTS';
  /** The unused override's token, or null for NEXUS_OVERRIDE_EXPORTS. */
  readonly token: string | null;
  /** The stubbed module, or null for NEXUS_OVERRIDE_UNUSED. */
  readonly module: string | null;
  /** The exports the stub lacks, empty for NEXUS_OVERRIDE_UNUSED. */
  readonly missing: readonly string[];
}

/** A testing override matched nothing, or a module stub misses exports. */
export class OverrideError extends errorBase<
  OverrideFields['code'],
  OverrideFields
>((fields) => fields.code, 'OverrideError') {}
