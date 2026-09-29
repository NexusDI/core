import { errorBase } from '@nexusdi/core';

/** graph() was called for a container registered without devtools(). */
export class DevtoolsError extends errorBase<
  'NEXUS_DEVTOOLS_UNREGISTERED',
  Record<string, never>
>('NEXUS_DEVTOOLS_UNREGISTERED', 'DevtoolsError') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_DEVTOOLS_UNREGISTERED: DevtoolsError;
  }
}
