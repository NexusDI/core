import { DOCS_URL } from './line.js';
import { errorBase, type NexusError } from './nexus-error.js';

interface BlueprintFields {
  readonly errors: readonly NexusError[];
}

const Base = errorBase<'NEXUS_BLUEPRINT_INVALID', BlueprintFields>(
  'NEXUS_BLUEPRINT_INVALID',
  'BlueprintError',
);

/**
 * Core's message for a BlueprintError: the count and the docs link, then
 * each inner error's current message, indented by two spaces.
 */
export function blueprintMessage(errors: readonly NexusError[]): string {
  const lines = errors.map(
    (error) => `  ${error.message.split('\n').join('\n    ')}`,
  );
  return [
    `[NEXUS_BLUEPRINT_INVALID] ${errors.length} error${errors.length === 1 ? '' : 's'}. ${DOCS_URL}NEXUS_BLUEPRINT_INVALID`,
    ...lines,
  ].join('\n');
}

/**
 * Every error one compilation found, in pass order. The visibility errors
 * (NEXUS_AMBIGUOUS_PROVIDER, then NEXUS_INVALID_EXPORT) follow module walk
 * order. Nothing was built.
 */
export class BlueprintError extends Base {
  constructor(errors: readonly NexusError[]) {
    super({ errors });
    // Written after super() and not through `text`, because a formatter may
    // still write this error's message.
    this.message = blueprintMessage(errors);
  }
}
