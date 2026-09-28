import { DOCS_URL } from './line.js';
import { errorBase, type NexusError } from './nexus-error.js';

interface BlueprintFields {
  readonly errors: readonly NexusError[];
}

const Base = errorBase<'NEXUS_BLUEPRINT_INVALID', BlueprintFields>(
  'NEXUS_BLUEPRINT_INVALID',
  'BlueprintError',
);

/** Every error one compilation found, in pass order. Nothing was built. */
export class BlueprintError extends Base {
  constructor(errors: readonly NexusError[]) {
    const lines = errors.map(
      (error) => `  ${error.message.split('\n').join('\n    ')}`,
    );
    super(
      { errors },
      {
        text: [
          `${errors.length} error${errors.length === 1 ? '' : 's'}. ${DOCS_URL}NEXUS_BLUEPRINT_INVALID`,
          ...lines,
        ].join('\n'),
      },
    );
  }
}
