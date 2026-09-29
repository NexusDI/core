import { errorBase } from '@nexusdi/core';

/** A decorator ran under experimentalDecorators. */
export class LegacyDecoratorsError extends errorBase<
  'NEXUS_LEGACY_DECORATORS',
  { readonly decorator: string }
>('NEXUS_LEGACY_DECORATORS', 'LegacyDecoratorsError') {}

export function legacyDecorators(decorator: string): LegacyDecoratorsError {
  return new LegacyDecoratorsError(
    { decorator },
    {
      text:
        `@${decorator} was called as a legacy decorator, and NexusDI's decorators are standard (TC39) decorators.\n` +
        '  Fix: remove experimentalDecorators from tsconfig, or register the class with provide() and defineModule().',
    },
  );
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_LEGACY_DECORATORS: LegacyDecoratorsError;
  }
}
