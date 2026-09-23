import { NexusError } from './nexus-error.js';

/** A NexusDI decorator was called the way experimentalDecorators calls one. */
export class LegacyDecoratorsError extends NexusError {
  declare readonly code: 'NEXUS_LEGACY_DECORATORS';
  readonly decorator: string;

  constructor(fields: { decorator: string }) {
    super(
      'NEXUS_LEGACY_DECORATORS',
      `@${fields.decorator} was called as a legacy decorator, and NexusDI's decorators are standard (TC39) decorators.\n` +
        '  Fix: remove experimentalDecorators from tsconfig, or register the class with provide() and defineModule().',
    );
    this.name = 'LegacyDecoratorsError';
    this.decorator = fields.decorator;
  }
}
