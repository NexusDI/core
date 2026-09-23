import { NexusError } from './nexus-error.js';

/** Every error one compilation found, in pass order. Nothing was built. */
export class BlueprintError extends NexusError {
  declare readonly code: 'NEXUS_BLUEPRINT_INVALID';
  readonly errors: readonly NexusError[];

  constructor(errors: readonly NexusError[]) {
    const count = `${errors.length} error${errors.length === 1 ? '' : 's'}`;
    const lines = errors.map(
      (error) => `  ${error.message.split('\n').join('\n    ')}`,
    );
    super(
      'NEXUS_BLUEPRINT_INVALID',
      `the module graph has ${count}; nothing was built.\n${lines.join('\n')}`,
    );
    this.name = 'BlueprintError';
    this.errors = errors;
  }
}
