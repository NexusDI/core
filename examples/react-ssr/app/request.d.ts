import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
