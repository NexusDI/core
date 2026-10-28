import '@nexusdi/core';

/**
 * The request every Meridian example scopes: a shuttle's mission.
 * A reader declares the same shape once in their own project; a doctest block
 * cannot, because it runs as a function body.
 */
declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
