import { NexusError } from './nexus-error.js';

/** A testing override matched nothing, or a module stub misses exports. */
export class OverrideError extends NexusError {
  declare readonly code: 'NEXUS_OVERRIDE_UNUSED' | 'NEXUS_OVERRIDE_EXPORTS';
  readonly token: string | null;
  readonly module: string | null;
  readonly missing: readonly string[];

  constructor(
    fields:
      | { code: 'NEXUS_OVERRIDE_UNUSED'; token: string }
      | {
          code: 'NEXUS_OVERRIDE_EXPORTS';
          module: string;
          missing: readonly string[];
        },
  ) {
    const message =
      fields.code === 'NEXUS_OVERRIDE_UNUSED'
        ? `override(${fields.token}) matched no provider in the module graph.\n  Fix: remove the override, or import the module that provides ${fields.token}.`
        : `the stub for ${fields.module} does not export ${fields.missing.join(', ')}, which ${fields.module} exports.\n  Fix: add them to the stub's exports.`;
    super(fields.code, message);
    this.name = 'OverrideError';
    this.token = fields.code === 'NEXUS_OVERRIDE_UNUSED' ? fields.token : null;
    this.module =
      fields.code === 'NEXUS_OVERRIDE_EXPORTS' ? fields.module : null;
    this.missing =
      fields.code === 'NEXUS_OVERRIDE_EXPORTS' ? fields.missing : [];
  }
}
