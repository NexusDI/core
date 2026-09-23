import { describeThrown } from './describe-thrown.js';
import { NexusError } from './nexus-error.js';

/** Another failure from the same startup level. */
export interface ProviderFailure {
  readonly token: string;
  readonly module: string;
  readonly cause: unknown;
}

/** A constructor, factory, onInit or options validation failed. */
export class ProviderError extends NexusError {
  declare readonly code: 'NEXUS_PROVIDER_FAILED';
  readonly token: string;
  readonly module: string;
  readonly path: readonly string[];
  readonly alsoFailed: readonly ProviderFailure[];
  readonly disposalErrors: readonly unknown[];

  constructor(fields: {
    token: string;
    module: string;
    path: readonly string[];
    cause: unknown;
    alsoFailed?: readonly ProviderFailure[];
    disposalErrors?: readonly unknown[];
  }) {
    const alsoFailed = fields.alsoFailed ?? [];
    const disposalErrors = fields.disposalErrors ?? [];
    const lines = [
      `${fields.token} (module ${fields.module}) failed: ${describeThrown(fields.cause)}`,
    ];
    if (fields.path.length > 1)
      lines.push(`  While building: ${fields.path.join(' → ')}`);
    if (alsoFailed.length > 0)
      lines.push(
        `  Also failed in the same level: ${alsoFailed.map((f) => f.token).join(', ')}`,
      );
    if (disposalErrors.length > 0)
      lines.push(
        `  ${disposalErrors.length} disposer(s) threw during cleanup; see disposalErrors.`,
      );
    super('NEXUS_PROVIDER_FAILED', lines.join('\n'), { cause: fields.cause });
    this.name = 'ProviderError';
    this.token = fields.token;
    this.module = fields.module;
    this.path = fields.path;
    this.alsoFailed = alsoFailed;
    this.disposalErrors = disposalErrors;
  }
}
