import { NexusError } from './nexus-error.js';

/** A lazy() thunk ran before its target was ready. */
export class NotReadyError extends NexusError {
  declare readonly code: 'NEXUS_NOT_READY';
  readonly owner: string;
  readonly target: string;
  readonly path: readonly string[];

  constructor(fields: {
    owner: string;
    target: string;
    path: readonly string[];
  }) {
    const cycle =
      fields.path.length > 0
        ? `\n  Runtime cycle: ${fields.path.join(' → ')}`
        : '';
    super(
      'NEXUS_NOT_READY',
      `${fields.owner} called its lazy(${fields.target}) thunk before ${fields.target} was ready.${cycle}\n` +
        `  Fix: call the thunk after startup, from a method, and not from a constructor, a factory's continuation or onInit.`,
    );
    this.name = 'NotReadyError';
    this.owner = fields.owner;
    this.target = fields.target;
    this.path = fields.path;
  }
}
