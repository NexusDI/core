import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
    /** The document request's signal: it aborts when the reader leaves. */
    signal?: AbortSignal;
  }
}
