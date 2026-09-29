import { errorBase } from '@nexusdi/core';

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

export function overrideUnused(token: string): OverrideError {
  return new OverrideError(
    { code: 'NEXUS_OVERRIDE_UNUSED', token, module: null, missing: [] },
    {
      text: `override(${token}) matched no provider in the module graph.\n  Fix: remove the override, or import the module that provides ${token}.`,
    },
  );
}

export function overrideExports(
  module: string,
  missing: readonly string[],
): OverrideError {
  return new OverrideError(
    { code: 'NEXUS_OVERRIDE_EXPORTS', token: null, module, missing },
    {
      text: `the stub for ${module} does not export ${missing.join(', ')}, which ${module} exports.\n  Fix: add them to the stub's exports.`,
    },
  );
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_OVERRIDE_UNUSED: OverrideError;
    NEXUS_OVERRIDE_EXPORTS: OverrideError;
  }
}
