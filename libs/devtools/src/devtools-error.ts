import { errorBase } from '@nexusdi/core';

interface DevtoolsFields {
  readonly code:
    | 'NEXUS_DEVTOOLS_UNREGISTERED'
    | 'NEXUS_DEVTOOLS_GRAPH_INVALID'
    | 'NEXUS_DEVTOOLS_PROFILE_REUSED';
  /**
   * NEXUS_DEVTOOLS_GRAPH_INVALID: the first bad field, such as
   * `providers[3].module`. null for NEXUS_DEVTOOLS_UNREGISTERED and
   * NEXUS_DEVTOOLS_PROFILE_REUSED.
   */
  readonly path: string | null;
}

/**
 * graph() was called for a container registered without devtools(),
 * parseGraph() was given a value that is not a NexusGraph, or report() was
 * called on a profile() that recorded a second container.
 */
export class DevtoolsError extends errorBase<
  DevtoolsFields['code'],
  DevtoolsFields
>((fields) => fields.code, 'DevtoolsError') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_DEVTOOLS_UNREGISTERED: DevtoolsError;
    NEXUS_DEVTOOLS_GRAPH_INVALID: DevtoolsError;
    NEXUS_DEVTOOLS_PROFILE_REUSED: DevtoolsError;
  }
}
